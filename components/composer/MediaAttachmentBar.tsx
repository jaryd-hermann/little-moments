import type { ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  ScrollView,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { EntryMedia } from "@/store/entryStore";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";

export interface MediaItem {
  uri: string;
  type: "image" | "video";
  /** Set when this row already exists in `entry_media` (edit mode). */
  existingId?: string;
}

interface MediaAttachmentBarProps {
  media: MediaItem[];
  onRemoveMedia: (index: number) => void;
  /** e.g. gallery button; when set, row still renders with only `leading` and no media. */
  leading?: ReactNode;
  /** Small tiles for composer dock next to the gallery icon. */
  compact?: boolean;
  resolveDbMedia?: (existingId: string) => EntryMedia | undefined;
}

export function MediaAttachmentBar({
  media,
  onRemoveMedia,
  leading,
  compact,
  resolveDbMedia,
}: MediaAttachmentBarProps) {
  if (media.length === 0 && !leading) return null;

  const dim = compact ? 44 : 72;
  const radius = compact ? 8 : 12;
  const removeSize = compact ? 18 : 20;
  const removeOffset = compact ? -2 : -4;

  const tileStyle: StyleProp<ViewStyle> = {
    width: dim,
    height: dim,
    borderRadius: radius,
    backgroundColor: "rgba(128,128,128,0.15)",
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: compact ? 8 : 0,
        flex: compact ? 1 : undefined,
        minWidth: 0,
      }}
    >
      {leading}
      {media.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={compact ? { flex: 1 } : undefined}
          contentContainerStyle={{
            gap: compact ? 8 : 8,
            alignItems: "center",
            paddingRight: compact ? 4 : 0,
          }}
        >
          {media.map((item, index) => {
            const db = item.existingId
              ? resolveDbMedia?.(item.existingId)
              : undefined;
            const key = item.existingId ?? `${index}-${item.uri}`;
            return (
              <View key={key} style={{ position: "relative" }}>
                {db ? (
                  <EntryMediaImage
                    media={db}
                    style={tileStyle}
                    recyclingKey={key}
                  />
                ) : (
                  <Image
                    source={{ uri: item.uri }}
                    style={tileStyle}
                    resizeMode="cover"
                  />
                )}
                <Pressable
                  onPress={() => onRemoveMedia(index)}
                  style={{
                    position: "absolute",
                    top: removeOffset,
                    right: removeOffset,
                    width: removeSize,
                    height: removeSize,
                    borderRadius: removeSize / 2,
                    backgroundColor: "rgba(0,0,0,0.72)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: compact ? 11 : 12,
                      lineHeight: compact ? 12 : 14,
                    }}
                  >
                    ✕
                  </Text>
                </Pressable>
                {item.type === "video" && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 2,
                      left: 2,
                      borderRadius: 4,
                      backgroundColor: "rgba(0,0,0,0.65)",
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                    }}
                  >
                    <Text style={{ fontSize: 9, color: "#fff" }}>VID</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
