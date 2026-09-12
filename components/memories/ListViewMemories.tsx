import { useMemo, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  SectionList,
  Pressable,
  type ViewToken,
} from "react-native";
import {
  format,
  isSameWeek,
  startOfWeek,
  subWeeks,
  getWeekOfMonth,
} from "date-fns";
import {
  MemorySearchBar,
  MEMORIES_SEARCH_ROW_HEIGHT,
} from "./MemorySearchBar";
import { EntryRow } from "./EntryRow";
import { ThreadCard } from "@/components/threads/ThreadCard";
import { MagicFillFeedButton } from "@/components/magic-fill/MagicFillFeedButton";
import { YearCaptureProgressBlock } from "@/components/common/YearCaptureProgressBlock";
import type { YearCaptureProgress } from "@/lib/yearCapture";
import type { Entry } from "@/store/entryStore";
import type { Thread } from "@/hooks/useThreads";
import type { ChapterRecord } from "@/lib/chapters";
import type { CapsuleFilter } from "./CapsuleStatBar";
import { useTheme } from "@/hooks/useTheme";
import { enqueueMomentsMediaPrefetch } from "@/lib/viewportMediaPrefetch";

type SortOrder = "newest" | "oldest";

type ListItem =
  | { type: "entry"; entry: Entry }
  | { type: "thread"; thread: Thread };

interface ListViewMemoriesProps {
  entries: Entry[];
  searchQuery: string;
  onChangeQuery: (q: string) => void;
  onOpenChapter?: (chapterId: string) => void;
  /**
   * Reports whether a given chapter is paywalled-locked for the current
   * user. The parent owns the lock state (it has `useChapters.isChapterLocked`)
   * and the actual paywall routing in `onOpenChapter` — the list just uses
   * this to render the lock icon next to chapter rows.
   */
  isChapterLockedById?: (chapterId: string) => boolean;
  /**
   * Resolves the full chapter record behind a chapter entry so the row can
   * render the same cover card the Chapters tab list uses. Rows fall back to
   * a plain text card while chapters are still loading.
   */
  chapterById?: (chapterId: string) => ChapterRecord | undefined;
  /**
   * Reports whether a given thread is paywalled-locked for the current user.
   * Without this the list would render thread cards fully openable even
   * when they sit past the free-tier cap (the Connect tab flipbook applies
   * this gate but the list view previously did not, letting users bypass
   * the paywall by tapping into Capsule). When a thread is locked, the
   * card shows the same lock overlay as Connect and routes through the
   * `paywall` flag-aware entry on tap.
   */
  isThreadLocked?: (thread: Thread) => boolean;
  connectionsTabSeenAt?: string | null;
  onThreadAnswerSaved?: (threadId: string, answer: string) => void;
  capsuleFilter?: CapsuleFilter;
  threads?: Thread[];
  showSearch?: boolean;
  showMagicFillButton?: boolean;
  /**
   * Share of the year captured, for the bar above the Magic Fill button. Comes
   * from the parent rather than `entries` because that list is search- and
   * filter-narrowed, which would make the percentage jump around.
   */
  yearProgress?: YearCaptureProgress | null;
}

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];

const LIST_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 25,
  minimumViewTime: 120,
};

/** Monday-start ISO week. Returns a stable group label and a sort key (epoch ms). */
function weekGroup(date: Date, today: Date): { label: string; sortKey: number } {
  const sortKey = startOfWeek(date, { weekStartsOn: 1 }).getTime();
  if (isSameWeek(date, today, { weekStartsOn: 1 })) {
    return { label: "THIS WEEK", sortKey };
  }
  if (isSameWeek(date, subWeeks(today, 1), { weekStartsOn: 1 })) {
    return { label: "LAST WEEK", sortKey };
  }
  const weekOfMonth = getWeekOfMonth(date, { weekStartsOn: 1 });
  const ordinal = ORDINALS[weekOfMonth] ?? `${weekOfMonth}th`;
  const monthName = format(date, "MMMM").toUpperCase();
  return { label: `${ordinal.toUpperCase()} WEEK OF ${monthName}`, sortKey };
}

export function ListViewMemories({
  entries,
  searchQuery,
  onChangeQuery,
  onOpenChapter,
  isChapterLockedById,
  chapterById,
  isThreadLocked,
  connectionsTabSeenAt = null,
  onThreadAnswerSaved,
  capsuleFilter = "all",
  threads = [],
  showSearch = false,
  showMagicFillButton = false,
  yearProgress = null,
}: ListViewMemoriesProps) {
  const { colors } = useTheme();
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const filteredByType = useMemo(() => {
    let list = entries;
    if (capsuleFilter === "moments") {
      list = list.filter((e) => e.entry_type !== "chapter");
    } else if (capsuleFilter === "chapters") {
      list = list.filter((e) => e.entry_type === "chapter");
    }
    return list;
  }, [entries, capsuleFilter]);

  const sections = useMemo(() => {
    const today = new Date();
    const sorted = [...filteredByType].sort((a, b) => {
      const da = a.entry_date ?? "";
      const db = b.entry_date ?? "";
      return sortOrder === "newest"
        ? db.localeCompare(da)
        : da.localeCompare(db);
    });

    // Group entries by their Monday-start week.
    // IMPORTANT: parse `entry_date` as a *local* calendar date (append
    // `T00:00:00`). `new Date("YYYY-MM-DD")` is parsed as UTC midnight per
    // the JS spec, which in any non-UTC timezone shifts the entry to the
    // previous calendar day — and a chapter dated Monday Apr 27 would land
    // in the prior Monday-start week, causing two headers ("LAST WEEK" +
    // "4TH WEEK OF APRIL") for the same calendar week.
    const entryGroups = new Map<string, { sortKey: number; entries: Entry[] }>();
    for (const entry of sorted) {
      const date = entry.entry_date
        ? new Date(`${entry.entry_date}T00:00:00`)
        : null;
      if (!date || Number.isNaN(date.getTime())) continue;
      const { label, sortKey } = weekGroup(date, today);
      let bucket = entryGroups.get(label);
      if (!bucket) {
        bucket = { sortKey, entries: [] };
        entryGroups.set(label, bucket);
      }
      bucket.entries.push(entry);
    }

    // Threads are intentionally **not** rendered on the Capsule. They live
    // exclusively on the Connect tab now — the Capsule only shows moments
    // and chapters.
    const allLabels = new Set([...entryGroups.keys()]);

    const labelSortKey = (label: string): number =>
      entryGroups.get(label)?.sortKey ?? 0;

    return [...allLabels]
      .sort((a, b) => {
        const ta = labelSortKey(a);
        const tb = labelSortKey(b);
        return sortOrder === "newest" ? tb - ta : ta - tb;
      })
      .map((label) => {
        // Within each week, the chapter card always renders last — even
        // when the chosen sort would otherwise put it first (e.g. "oldest"
        // sort surfaces the Monday-dated chapter ahead of the rest of the
        // week's moments). Moments in sorted order, then any chapter rows.
        const groupEntries = entryGroups.get(label)?.entries ?? [];
        const moments = groupEntries.filter((e) => e.entry_type !== "chapter");
        const chaptersInWeek = groupEntries.filter(
          (e) => e.entry_type === "chapter"
        );
        const entryItems: ListItem[] = [
          ...moments.map((entry) => ({ type: "entry" as const, entry })),
          ...chaptersInWeek.map((entry) => ({ type: "entry" as const, entry })),
        ];
        return {
          title: label,
          count: entryItems.length,
          data: entryItems,
        };
      });
  }, [filteredByType, sortOrder]);

  const currentSortLabel =
    SORT_OPTIONS.find((o) => o.value === sortOrder)?.label ?? "Newest";

  const keyExtractor = useCallback(
    (
      item: ListItem | undefined,
      index: number,
      section?: { title: string }
    ) => {
      if (item?.type === "entry" && item.entry?.id) return item.entry.id;
      if (item?.type === "thread" && item.thread?.id) {
        return `thread-${item.thread.id}`;
      }
      return `capsule-${section?.title ?? "row"}-${index}`;
    },
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item?.type === "thread" && item.thread) {
        return (
          <View style={{ marginBottom: 12 }}>
            <ThreadCard
              thread={item.thread}
              locked={isThreadLocked?.(item.thread) ?? false}
              connectionsTabSeenAt={connectionsTabSeenAt}
              onAnswerSaved={onThreadAnswerSaved}
            />
          </View>
        );
      }
      if (item?.type !== "entry" || !item.entry) return null;
      const isChapterEntry = item.entry.entry_type === "chapter";
      const chapterLocked =
        isChapterEntry && item.entry.chapter_id
          ? (isChapterLockedById?.(item.entry.chapter_id) ?? false)
          : false;
      const chapterRecord =
        isChapterEntry && item.entry.chapter_id
          ? chapterById?.(item.entry.chapter_id)
          : undefined;
      return (
        <View style={{ marginBottom: 12 }}>
          <EntryRow
            entry={item.entry}
            onOpenChapter={onOpenChapter}
            chapterLocked={chapterLocked}
            chapterRecord={chapterRecord}
          />
        </View>
      );
    },
    [
      chapterById,
      connectionsTabSeenAt,
      isChapterLockedById,
      isThreadLocked,
      onOpenChapter,
      onThreadAnswerSaved,
    ]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => (
      <View style={{ paddingTop: 18, paddingBottom: 10 }}>
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 11,
            color: colors.textMuted,
            letterSpacing: 1.4,
          }}
        >
          {section.title}
        </Text>
      </View>
    ),
    [colors.textMuted]
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const batch: Entry[] = [];
      for (const token of viewableItems) {
        const item = token.item as ListItem | undefined;
        if (item?.type === "entry" && item.entry) batch.push(item.entry);
      }
      if (batch.length > 0) {
        enqueueMomentsMediaPrefetch(batch, 8000);
      }
    }
  ).current;

  const listHeader =
    yearProgress || showMagicFillButton ? (
      <View style={{ gap: 12, marginBottom: 4 }}>
        {yearProgress ? (
          <YearCaptureProgressBlock
            year={yearProgress.year}
            progress={yearProgress.ratio}
          />
        ) : null}
        {showMagicFillButton ? (
          <MagicFillFeedButton source="capsule_banner" embedded compact />
        ) : null}
      </View>
    ) : undefined;

  return (
    <View className="flex-1">
      {showSearch && (
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <MemorySearchBar
              query={searchQuery}
              onChangeQuery={onChangeQuery}
            />
          </View>
          <View style={{ position: "relative", flexShrink: 0 }}>
            <Pressable
              onPress={() => setShowSortDropdown((v) => !v)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                height: MEMORIES_SEARCH_ROW_HEIGHT,
                minHeight: MEMORIES_SEARCH_ROW_HEIGHT,
                paddingHorizontal: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                gap: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 12,
                  color: colors.text,
                }}
                numberOfLines={1}
              >
                {currentSortLabel}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                {showSortDropdown ? "▲" : "▼"}
              </Text>
            </Pressable>
            {showSortDropdown && (
              <View
                style={{
                  position: "absolute",
                  top: 44,
                  right: 0,
                  zIndex: 100,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceSecondary,
                  overflow: "hidden",
                  minWidth: 112,
                }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      setSortOrder(opt.value);
                      setShowSortDropdown(false);
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      backgroundColor:
                        sortOrder === opt.value
                          ? colors.primaryLight + "28"
                          : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Roboto-Regular",
                        fontSize: 13,
                        color:
                          sortOrder === opt.value
                            ? colors.primary
                            : colors.text,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      <SectionList
        style={{ flex: 1 }}
        sections={sections}
        ListHeaderComponent={listHeader}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        stickySectionHeadersEnabled={false}
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={9}
        updateCellsBatchingPeriod={50}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={LIST_VIEWABILITY_CONFIG}
      />
    </View>
  );
}
