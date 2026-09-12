import { useCallback } from "react";
import { ActivityIndicator, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import type { Thread } from "@/hooks/useThreads";
import { ThreadFeedRow } from "@/components/threads/ThreadFeedRow";
import type { ThreadFeedbackSentiment } from "@/lib/threadFeedback";
import { useTheme } from "@/hooks/useTheme";

interface ThreadFeedViewProps {
  threads: Thread[];
  isLocked: (thread: Thread, index: number) => boolean;
  onAnswerSaved: (threadId: string, answer: string) => void;
  onFeedbackSubmitted: (
    threadId: string,
    patch: {
      hidden_from_feed: boolean;
      highlighted: boolean;
      feedback_sentiment: ThreadFeedbackSentiment;
    }
  ) => void;
  onEndReached?: () => void;
  loadingMore?: boolean;
}

export function ThreadFeedView({
  threads,
  isLocked,
  onAnswerSaved,
  onFeedbackSubmitted,
  onEndReached,
  loadingMore = false,
}: ThreadFeedViewProps) {
  const { colors } = useTheme();

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={{ paddingVertical: 16, alignItems: "center" }}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }, [colors.textSecondary, loadingMore]);

  return (
    <FlashList
      data={threads}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.35}
      ListFooterComponent={renderFooter}
      renderItem={({ item, index }) => (
        <ThreadFeedRow
          thread={item}
          locked={isLocked(item, index)}
          nextHighlighted={threads[index + 1]?.highlighted ?? false}
          onAnswerSaved={onAnswerSaved}
          onFeedbackSubmitted={onFeedbackSubmitted}
        />
      )}
    />
  );
}
