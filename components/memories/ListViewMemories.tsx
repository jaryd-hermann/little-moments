import { useMemo, useState } from "react";
import { useCapsuleFlipbookStore } from "@/store/capsuleFlipbookStore";
import { View, Text, SectionList, Pressable } from "react-native";
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
import type { Entry } from "@/store/entryStore";
import type { Thread } from "@/hooks/useThreads";
import type { CapsuleFilter } from "./CapsuleStatBar";
import { useTheme } from "@/hooks/useTheme";
import { threadOrdinalByIdMap } from "@/lib/threadOrdinal";

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
   * Reports whether a given thread is paywalled-locked for the current user.
   * Without this the list would render thread cards fully openable even
   * when they sit past the free-tier cap (the Connect tab flipbook applies
   * this gate but the list view previously did not, letting users bypass
   * the paywall by tapping into Capsule). When a thread is locked, the
   * card shows the same lock overlay as Connect and routes through the
   * `paywall` flag-aware entry on tap.
   */
  isThreadLocked?: (thread: Thread) => boolean;
  capsuleFilter?: CapsuleFilter;
  threads?: Thread[];
  showSearch?: boolean;
}

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];

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
  isThreadLocked,
  capsuleFilter = "all",
  threads = [],
  showSearch = false,
}: ListViewMemoriesProps) {
  const { colors } = useTheme();
  const pinnedOnly = useCapsuleFlipbookStore((s) => s.pinnedOnly);

  const threadOrdinals = useMemo(
    () => threadOrdinalByIdMap(threads),
    [threads]
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const filteredByType = useMemo(() => {
    let list = entries;
    if (capsuleFilter === "moments") {
      list = list.filter((e) => e.entry_type !== "chapter");
    } else if (capsuleFilter === "chapters") {
      list = list.filter((e) => e.entry_type === "chapter");
    }
    if (pinnedOnly) {
      list = list.filter(
        (e) => e.entry_type === "moment" && Boolean(e.is_pinned)
      );
    }
    return list;
  }, [entries, capsuleFilter, pinnedOnly]);

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

    // Group threads by the same week buckets.
    const threadGroups = new Map<string, Thread[]>();
    for (const t of threads) {
      if (t.dismissed) continue;
      const created = new Date(t.created_at);
      if (Number.isNaN(created.getTime())) continue;
      const { label } = weekGroup(created, today);
      if (!threadGroups.has(label)) threadGroups.set(label, []);
      threadGroups.get(label)!.push(t);
    }
    for (const [label, arr] of threadGroups) {
      const seen = new Set<string>();
      const deduped: Thread[] = [];
      for (const t of arr) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        deduped.push(t);
      }
      deduped.sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );
      threadGroups.set(label, deduped);
    }

    const allLabels = new Set([
      ...entryGroups.keys(),
      ...threadGroups.keys(),
    ]);

    const labelSortKey = (label: string): number => {
      const eg = entryGroups.get(label);
      if (eg) return eg.sortKey;
      const tg = threadGroups.get(label);
      if (tg?.[0]) {
        return startOfWeek(new Date(tg[0].created_at), { weekStartsOn: 1 }).getTime();
      }
      return 0;
    };

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
        // week's moments). Threads first, then moments in their sorted
        // order, then any chapter rows.
        const groupEntries = entryGroups.get(label)?.entries ?? [];
        const moments = groupEntries.filter((e) => e.entry_type !== "chapter");
        const chaptersInWeek = groupEntries.filter(
          (e) => e.entry_type === "chapter"
        );
        const entryItems: ListItem[] = [
          ...moments.map((entry) => ({ type: "entry" as const, entry })),
          ...chaptersInWeek.map((entry) => ({ type: "entry" as const, entry })),
        ];
        const threadItems: ListItem[] = (threadGroups.get(label) ?? []).map(
          (thread) => ({ type: "thread", thread })
        );
        return {
          title: label,
          count: entryItems.length,
          data: [...threadItems, ...entryItems],
        };
      });
  }, [filteredByType, sortOrder, threads]);

  const currentSortLabel =
    SORT_OPTIONS.find((o) => o.value === sortOrder)?.label ?? "Newest";

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
        sections={sections}
        keyExtractor={(item) =>
          item.type === "entry" ? item.entry.id : `thread-${item.thread.id}`
        }
        renderItem={({ item }) => {
          if (item.type === "thread") {
            return (
              <View style={{ marginBottom: 12 }}>
                <ThreadCard
                  thread={item.thread}
                  locked={isThreadLocked?.(item.thread) ?? false}
                  ordinalRank={threadOrdinals.get(item.thread.id) ?? 1}
                />
              </View>
            );
          }
          const isChapterEntry = item.entry.entry_type === "chapter";
          const chapterLocked =
            isChapterEntry && item.entry.chapter_id
              ? (isChapterLockedById?.(item.entry.chapter_id) ?? false)
              : false;
          return (
            <View style={{ marginBottom: 12 }}>
              <EntryRow
                entry={item.entry}
                onOpenChapter={onOpenChapter}
                chapterLocked={chapterLocked}
              />
            </View>
          );
        }}
        renderSectionHeader={({ section }) => (
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
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}
