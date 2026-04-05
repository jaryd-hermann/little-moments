import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import {
  resolveFollowUpScreenKey,
  type ResonanceTag,
} from "@/lib/onboardingFollowUp";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { usePostHog } from "posthog-react-native";

const BG = "#000000";
const OUTLINE = "#FFFFFF";
const INK = "#FFFFFF";
const SELECTED_CARD = "#FFFFEB";
const CTA_LAVENDER = "#f0d7ff";

const CARD_ICONS = [
  "calendar-outline",
  "time-outline",
  "book-outline",
  "repeat-outline",
  "eye-outline",
  "heart-outline",
  "flash-outline",
  "chatbubble-ellipses-outline",
] as const;

type PurposeRow = {
  id: string;
  label: string;
  tag: string;
  sort_order: number;
};

export default function ResonanceScreen() {
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [options, setOptions] = useState<PurposeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    posthog.capture("viewed_resonance");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: qErr } = await supabase
        .from("purpose_options")
        .select("id, label, tag, sort_order")
        .order("sort_order", { ascending: true });

      if (!cancelled) {
        if (qErr || !data?.length) {
          setError(
            qErr?.message ??
              "Could not load options. Apply the latest Supabase migration (0002)."
          );
          setOptions([]);
        } else {
          setOptions(data as PurposeRow[]);
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onNext = async () => {
    if (selected.size === 0 || !user) return;
    setSaving(true);
    setError("");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const ids = Array.from(selected);
    const tagSet = new Set<ResonanceTag>();
    for (const row of options) {
      if (selected.has(row.id)) {
        tagSet.add(row.tag as ResonanceTag);
      }
    }
    const followKey = resolveFollowUpScreenKey([...tagSet]);

    const { error: rpcErr } = await supabase.rpc("record_resonance_selections", {
      p_option_ids: ids,
      p_follow_up_key: followKey,
    });

    if (rpcErr) {
      setError(rpcErr.message);
      setSaving(false);
      return;
    }

    const { data: fresh } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (fresh) {
      setProfile(fresh as Profile);
    }

    posthog.capture("completed_resonance", { option_count: ids.length });
    router.replace("/(auth)/personalized");
    setSaving(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={OUTLINE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: BG }}
      edges={["top", "left", "right"]}
    >
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
          <View
            style={{
              flexDirection: "row",
              height: 3,
              borderRadius: 2,
              overflow: "hidden",
              backgroundColor: "rgba(255,255,255,0.2)",
            }}
          >
            <View style={{ flex: 1, backgroundColor: OUTLINE }} />
            <View style={{ flex: 1, backgroundColor: "transparent" }} />
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 28,
            paddingBottom: 24,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 24,
              color: INK,
              textAlign: "center",
              lineHeight: 32,
            }}
          >
            Which of these do you resonate with?
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 15,
              color: "rgba(255,255,255,0.65)",
              textAlign: "center",
              marginTop: 10,
            }}
          >
            Select all that apply.
          </Text>

          {error ? (
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 13,
                color: "#F87171",
                textAlign: "center",
                marginTop: 16,
              }}
            >
              {error}
            </Text>
          ) : null}

          <View style={{ marginTop: 28, gap: 12 }}>
            {options.map((row, index) => {
              const isOn = selected.has(row.id);
              const iconName = CARD_ICONS[index % CARD_ICONS.length];
              return (
                <Pressable
                  key={row.id}
                  onPress={() => toggle(row.id)}
                  style={{
                    borderRadius: 16,
                    borderWidth: 1.5,
                    borderColor: OUTLINE,
                    backgroundColor: isOn ? SELECTED_CARD : "transparent",
                    paddingVertical: 18,
                    paddingHorizontal: 16,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Ionicons
                    name={iconName}
                    size={22}
                    color={isOn ? BG : INK}
                    style={{ marginRight: 14 }}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: "Roboto-Regular",
                      fontSize: 16,
                      lineHeight: 22,
                      color: isOn ? BG : INK,
                    }}
                  >
                    {row.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View
          style={{
            backgroundColor: BG,
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Pressable
            onPress={onNext}
            disabled={selected.size === 0 || saving}
            style={{
              height: 52,
              borderRadius: 9999,
              backgroundColor:
                selected.size === 0 || saving
                  ? "rgba(255,255,255,0.25)"
                  : CTA_LAVENDER,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {saving ? (
              <ActivityIndicator color={BG} />
            ) : (
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color:
                    selected.size === 0
                      ? "rgba(255,255,255,0.45)"
                      : BG,
                  letterSpacing: 0.5,
                }}
              >
                Next
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
