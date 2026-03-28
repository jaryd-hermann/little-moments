import { View, Text, Pressable, Image, ScrollView } from "react-native";

export interface MediaItem {
  uri: string;
  type: "image" | "video";
}

interface MediaAttachmentBarProps {
  media: MediaItem[];
  onRemoveMedia: (index: number) => void;
}

export function MediaAttachmentBar({
  media,
  onRemoveMedia,
}: MediaAttachmentBarProps) {
  if (media.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {media.map((item, index) => (
        <View key={index} className="relative">
          <Image
            source={{ uri: item.uri }}
            className="h-[72px] w-[72px] rounded-xl"
          />
          <Pressable
            onPress={() => onRemoveMedia(index)}
            className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-black/70"
          >
            <Text className="text-xs text-white">✕</Text>
          </Pressable>
          {item.type === "video" && (
            <View className="absolute bottom-1 left-1 rounded bg-black/60 px-1">
              <Text className="text-[10px] text-white">VID</Text>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
