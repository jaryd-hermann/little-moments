import { useCallback, useEffect, useMemo, useState } from "react";
import { useEntries } from "@/hooks/useEntries";
import {
  buildMomentDateSet,
  countAvailableGapDays,
} from "@/lib/magicFill";
import { isGapCountCacheValid } from "@/lib/magicFillGapCache";
import {
  useMagicFillStore,
  type MagicFillGapTarget,
} from "@/store/magicFillStore";

export function useMagicFillGapCount(gapTarget: MagicFillGapTarget = 10) {
  const { entries } = useEntries();
  const gapCountCache = useMagicFillStore((s) => s.gapCountCache);
  const setGapCountCache = useMagicFillStore((s) => s.setGapCountCache);
  const [count, setCount] = useState<number | null>(
    isGapCountCacheValid(gapCountCache, gapTarget) ? gapCountCache!.count : null
  );
  const [loading, setLoading] = useState(false);

  const momentDates = useMemo(() => buildMomentDateSet(entries), [entries]);

  const refresh = useCallback(async () => {
    if (isGapCountCacheValid(gapCountCache, gapTarget)) {
      setCount(gapCountCache!.count);
      return gapCountCache!.count;
    }
    setLoading(true);
    try {
      const n = await countAvailableGapDays(gapTarget, momentDates);
      setCount(n);
      setGapCountCache({ count: n, gapTarget, at: Date.now() });
      return n;
    } finally {
      setLoading(false);
    }
  }, [gapCountCache, gapTarget, momentDates, setGapCountCache]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { count, loading, refresh };
}
