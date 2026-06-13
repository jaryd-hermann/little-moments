import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { ProgressCapsule } from "@/components/common/ProgressCapsule";
import { MagicFillFeedButton } from "@/components/magic-fill/MagicFillFeedButton";
import { useTheme } from "@/hooks/useTheme";
import { momentTitleStyle } from "@/lib/momentTypography";
import type { Entry } from "@/store/entryStore";
import { Ionicons } from "@expo/vector-icons";
import {
  endOfMonth,
  format,
  parse,
  startOfMonth,
  subMonths,
} from "date-fns";
import { memo, useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

interface GridViewMemoriesProps {
  entries: Entry[];
  onPressEntry: (entry: Entry) => void;
  onPressEmptyDay: (ymd: string) => void;
  /** When true, only render days/months that have entries (core-memory filter). */
  coreOnly?: boolean;
  showMagicFillButton?: boolean;
}

interface MonthBlock {
  start: Date;
  label: string;
  /** Number of day-cells rendered (clamped to "today" for the current month). */
  visibleDays: number;
  isCurrentMonth: boolean;
}

interface CoreDayCell {
  day: number;
  ymd: string;
  date: Date;
}

interface CoreMonthBlock {
  start: Date;
  label: string;
  /** Distinct calendar days in this month that have at least one entry. */
  days: CoreDayCell[];
  /** Total entries in this month (may exceed `days.length`). */
  entryCount: number;
}

const COLUMNS = 3;
const SHORT_WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function buildMonthBlock(start: Date, today: Date): MonthBlock {
  const startOfM = startOfMonth(start);
  const endOfM = endOfMonth(start);
  const isCurrentMonth =
    startOfM.getMonth() === today.getMonth() &&
    startOfM.getFullYear() === today.getFullYear();
  const lastVisible = isCurrentMonth ? today.getDate() : endOfM.getDate();
  return {
    start: startOfM,
    label: format(startOfM, "MMMM yyyy").toUpperCase(),
    visibleDays: lastVisible,
    isCurrentMonth,
  };
}

function buildCoreMonthBlocks(entries: Entry[]): CoreMonthBlock[] {
  const byMonth = new Map<
    string,
    { start: Date; days: Map<string, CoreDayCell>; entryCount: number }
  >();

  for (const e of entries) {
    if (e.entry_type !== "moment" || !e.entry_date) continue;
    const date = parse(e.entry_date, "yyyy-MM-dd", new Date());
    const monthStart = startOfMonth(date);
    const monthKey = format(monthStart, "yyyy-MM");
    let bucket = byMonth.get(monthKey);
    if (!bucket) {
      bucket = { start: monthStart, days: new Map(), entryCount: 0 };
      byMonth.set(monthKey, bucket);
    }
    bucket.entryCount += 1;
    if (!bucket.days.has(e.entry_date)) {
      bucket.days.set(e.entry_date, {
        day: date.getDate(),
        ymd: e.entry_date,
        date,
      });
    }
  }

  return [...byMonth.values()]
    .map((bucket) => ({
      start: bucket.start,
      label: format(bucket.start, "MMMM yyyy").toUpperCase(),
      days: [...bucket.days.values()].sort(
        (a, b) => a.date.getTime() - b.date.getTime()
      ),
      entryCount: bucket.entryCount,
    }))
    .sort((a, b) => b.start.getTime() - a.start.getTime());
}

function coreMemoryLabel(count: number): string {
  return count === 1 ? "1 core memory" : `${count} core memories`;
}

/**
 * Capsule "Grid" view — inverted Apple-Camera-Roll-style feed.
 *
 *  - Newest month sits at the **bottom**; today is the last cell.
 *  - Scrolling UP reveals older months (lazy-loaded a month at a time as the
 *    user pulls past the top, courtesy of `onEndReached` on an `inverted`
 *    FlatList).
 *  - 3-column grid: each tile is large enough to show the thumbnail and the
 *    date/day/title without cramping.
 *  - Future days are hidden entirely (the current-month grid stops at today).
 *  - The last visible day of every month is right-aligned in the bottom row
 *    of that month's block by padding the leading edge of the grid, so the
 *    bottom-right of the whole capsule view is always the most recent date.
 *
 * In `coreOnly` mode the calendar skeleton is dropped: only months and days
 * that contain a (core) moment are rendered, with a count tag instead of the
 * month progress bar.
 */
export function GridViewMemories({
  entries,
  onPressEntry,
  onPressEmptyDay,
  coreOnly = false,
  showMagicFillButton = false,
}: GridViewMemoriesProps) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const OUTER_PAD = 16;
  const INNER_GAP = 8;
  const CELL_W = Math.floor(
    (screenWidth - OUTER_PAD * 2 - INNER_GAP * (COLUMNS - 1)) / COLUMNS
  );
  const CELL_H = CELL_W + 30;

  const today = useMemo(() => new Date(), []);
  const todayYmd = format(today, "yyyy-MM-dd");

  const [monthsBack, setMonthsBack] = useState(0);

  const months: MonthBlock[] = useMemo(() => {
    const out: MonthBlock[] = [];
    for (let i = 0; i <= monthsBack; i++) {
      out.push(buildMonthBlock(subMonths(today, i), today));
    }
    return out;
  }, [monthsBack, today]);

  const coreMonths = useMemo(
    () => (coreOnly ? buildCoreMonthBlocks(entries) : []),
    [coreOnly, entries]
  );

  const entriesByYmd = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      if (e.entry_type !== "moment" || !e.entry_date) continue;
      const arr = map.get(e.entry_date) ?? [];
      arr.push(e);
      map.set(e.entry_date, arr);
    }
    return map;
  }, [entries]);

  const handleEndReached = useCallback(() => {
    if (!coreOnly) {
      setMonthsBack((m) => m + 1);
    }
  }, [coreOnly]);

  const Cell = useMemo(
    () =>
      memo(function CellInner({
        day,
        ymd,
        date,
        weekdayLabel,
        firstEntry,
        extraCount,
        cellW,
        cellH,
        onPress,
      }: {
        day: number;
        ymd: string;
        date: Date;
        weekdayLabel: string;
        firstEntry: Entry | null;
        extraCount: number;
        cellW: number;
        cellH: number;
        onPress: (ymd: string, entry: Entry | null) => void;
      }) {
        const isToday = ymd === todayYmd;
        const firstMedia =
          firstEntry?.media && firstEntry.media.length > 0
            ? firstEntry.media[0]
            : null;
        void date;
        return (
          <Pressable
            onPress={() => onPress(ymd, firstEntry)}
            style={{ width: cellW, height: cellH }}
          >
            <View
              style={{
                width: cellW,
                height: cellW,
                borderRadius: 12,
                overflow: "hidden",
                backgroundColor: firstMedia
                  ? colors.surface
                  : colors.surfaceSecondary,
                borderWidth: isToday ? 2 : 0,
                borderColor: isToday ? colors.primary : "transparent",
              }}
            >
              {firstMedia ? (
                <EntryMediaImage
                  media={firstMedia}
                  style={{ width: "100%", height: "100%" }}
                  transition={220}
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="add"
                    size={20}
                    color={colors.textMuted}
                  />
                </View>
              )}

              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 6,
                  left: 8,
                  flexDirection: "row",
                  alignItems: "baseline",
                  gap: 4,
                  ...{ textShadowColor: "rgba(0,0,0,0.4)" },
                }}
              >
                <Text
                  style={{
                    fontFamily: "PMGothicLudington-Text110",
                    fontSize: 22,
                    lineHeight: 24,
                    color: "#FFFFFF",
                    textShadowColor: "rgba(0,0,0,0.55)",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                  }}
                >
                  {day}
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 11,
                    letterSpacing: 0.5,
                    color: "#FFFFFF",
                    textShadowColor: "rgba(0,0,0,0.55)",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                  }}
                >
                  {weekdayLabel}
                </Text>
              </View>

              {extraCount > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    backgroundColor: "rgba(0,0,0,0.6)",
                    borderRadius: 9999,
                    paddingHorizontal: 6,
                    height: 18,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 10,
                      color: "#FFFFFF",
                    }}
                  >
                    +{extraCount}
                  </Text>
                </View>
              ) : null}
            </View>

            {firstEntry ? (
              <Text
                numberOfLines={1}
                style={momentTitleStyle({
                  fontSize: 12,
                  color: colors.textSecondary,
                  marginTop: 6,
                  paddingHorizontal: 2,
                })}
              >
                {firstEntry.title || firstEntry.body.slice(0, 40)}
              </Text>
            ) : null}
          </Pressable>
        );
      }),
    [
      colors.primary,
      colors.surface,
      colors.surfaceSecondary,
      colors.textMuted,
      colors.textSecondary,
      todayYmd,
    ]
  );

  const handleCellPress = useCallback(
    (ymd: string, entry: Entry | null) => {
      if (entry) onPressEntry(entry);
      else onPressEmptyDay(ymd);
    },
    [onPressEntry, onPressEmptyDay]
  );

  const renderDayCell = useCallback(
    (cell: CoreDayCell) => {
      const dayEntries = entriesByYmd.get(cell.ymd) ?? [];
      const firstEntry = dayEntries[0] ?? null;
      const weekdayLabel = SHORT_WEEKDAYS[cell.date.getDay()];
      return (
        <Cell
          key={cell.ymd}
          day={cell.day}
          ymd={cell.ymd}
          date={cell.date}
          weekdayLabel={weekdayLabel}
          firstEntry={firstEntry}
          extraCount={Math.max(0, dayEntries.length - 1)}
          cellW={CELL_W}
          cellH={CELL_H}
          onPress={handleCellPress}
        />
      );
    },
    [CELL_H, CELL_W, Cell, entriesByYmd, handleCellPress]
  );

  const renderCoreMonth = useCallback(
    (block: CoreMonthBlock) => (
      <View key={block.label} style={{ marginBottom: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: OUTER_PAD,
            marginBottom: 12,
            gap: 10,
          }}
        >
          <Text
            style={{
              fontFamily: "PMGothicLudington-Text110",
              fontSize: 22,
              color: colors.text,
              flexShrink: 0,
            }}
          >
            {block.label}
          </Text>
          <View
            style={{
              borderRadius: 9999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceSecondary,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 12,
                color: colors.textSecondary,
                letterSpacing: 0.2,
              }}
            >
              {coreMemoryLabel(block.entryCount)}
            </Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            paddingHorizontal: OUTER_PAD,
            columnGap: INNER_GAP,
            rowGap: INNER_GAP,
          }}
        >
          {block.days.map((cell) => renderDayCell(cell))}
        </View>
      </View>
    ),
    [colors.border, colors.surfaceSecondary, colors.text, colors.textSecondary, renderDayCell]
  );

  const renderMonth = useCallback(
    (block: MonthBlock) => {
      const leadingPad = (COLUMNS - (block.visibleDays % COLUMNS)) % COLUMNS;
      type MonthCellModel =
        | { type: "pad" }
        | { type: "day"; day: number; ymd: string; date: Date };
      const cells: MonthCellModel[] = [];
      for (let i = 0; i < leadingPad; i++) cells.push({ type: "pad" });
      for (let d = 1; d <= block.visibleDays; d++) {
        const date = new Date(
          block.start.getFullYear(),
          block.start.getMonth(),
          d
        );
        cells.push({ type: "day", day: d, ymd: format(date, "yyyy-MM-dd"), date });
      }

      const totalDaysForRatio = block.visibleDays;
      const capturedDaysThisMonth = new Set<string>();
      for (let d = 1; d <= block.visibleDays; d++) {
        const ymd = format(
          new Date(block.start.getFullYear(), block.start.getMonth(), d),
          "yyyy-MM-dd"
        );
        if ((entriesByYmd.get(ymd) ?? []).length > 0) {
          capturedDaysThisMonth.add(ymd);
        }
      }
      const monthRatio =
        totalDaysForRatio > 0
          ? capturedDaysThisMonth.size / totalDaysForRatio
          : 0;
      const monthPct = Math.round(monthRatio * 100);

      return (
        <View key={block.label} style={{ marginBottom: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: OUTER_PAD,
              marginBottom: 12,
              gap: 12,
            }}
          >
            <Text
              style={{
                fontFamily: "PMGothicLudington-Text110",
                fontSize: 22,
                color: colors.text,
                flexShrink: 0,
              }}
            >
              {block.label}
            </Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ProgressCapsule
                progress={monthRatio}
                label={`${monthPct}% captured`}
                labelColor="#1A1A1A"
                height={24}
              />
            </View>
          </View>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              paddingHorizontal: OUTER_PAD,
              columnGap: INNER_GAP,
              rowGap: INNER_GAP,
            }}
          >
            {cells.map((cell, idx) => {
              if (cell.type === "pad") {
                return (
                  <View
                    key={`pad-${idx}`}
                    style={{ width: CELL_W, height: CELL_H }}
                  />
                );
              }
              return renderDayCell({
                day: cell.day,
                ymd: cell.ymd,
                date: cell.date,
              });
            })}
          </View>
        </View>
      );
    },
    [CELL_H, CELL_W, colors.text, entriesByYmd, renderDayCell]
  );

  const magicFillInline = showMagicFillButton ? (
    <View style={{ paddingHorizontal: OUTER_PAD, paddingBottom: 12 }}>
      <MagicFillFeedButton source="capsule_banner" embedded compact />
    </View>
  ) : null;

  if (coreOnly) {
    return (
      <FlatList
        data={coreMonths}
        inverted
        keyExtractor={(item) => item.label}
        renderItem={({ item }) => renderCoreMonth(item)}
        contentContainerStyle={{ paddingTop: 60, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={magicFillInline}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: OUTER_PAD, paddingTop: 40 }}>
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 15,
                color: colors.textSecondary,
                textAlign: "center",
              }}
            >
              No core memories yet
            </Text>
          </View>
        }
      />
    );
  }

  return (
    <FlatList
      data={months}
      inverted
      keyExtractor={(item) => item.label}
      renderItem={({ item }) => renderMonth(item)}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      contentContainerStyle={{ paddingTop: 60, paddingBottom: 8 }}
      showsVerticalScrollIndicator={false}
      initialNumToRender={1}
      maxToRenderPerBatch={1}
      windowSize={3}
      ListHeaderComponent={magicFillInline}
    />
  );
}

export { COLUMNS as GRID_COLUMNS };
