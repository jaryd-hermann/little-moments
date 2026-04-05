import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import {
  parseChapterRow,
  type ChapterRecord,
} from "@/lib/chapters";

export function useChapters() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [chapters, setChapters] = useState<ChapterRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchChapters = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("chapters")
      .select("*")
      .eq("user_id", userId)
      .order("chapter_number", { ascending: false });

    if (error) {
      console.log("[useChapters] fetch error:", error.message);
    }
    if (data) {
      console.log("[useChapters] raw rows:", data.length);
      const parsed = data
        .map((r) => {
          const result = parseChapterRow(r);
          if (!result) console.log("[useChapters] parseChapterRow returned null for:", r.id, "slides type:", typeof r.slides, "slides:", JSON.stringify(r.slides)?.substring(0, 100));
          return result;
        })
        .filter((r): r is ChapterRecord => r != null);
      console.log("[useChapters] parsed chapters:", parsed.length);
      setChapters(parsed);
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  const latestChapter = chapters.length > 0 ? chapters[0] : null;

  return { chapters, latestChapter, isLoading, fetchChapters };
}
