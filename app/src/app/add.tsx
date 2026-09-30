import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Body, Button, Heading, Kicker, Rule } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { addScreenshots, addVideo, isVideoLink, useCookbook } from "@/lib/cookbook";
import { fonts, useColors } from "@/lib/theme";

const MAX_SCREENSHOTS = 20;

export default function AddRecipe() {
  const colors = useColors();
  const { session } = useAuth();
  const { cookbook, reload } = useCookbook();
  const [link, setLink] = useState("");
  const [screenshots, setScreenshots] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [busy, setBusy] = useState<"video" | "images" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function paste() {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) setLink(text.trim());
    } catch {
      setError("Couldn't read the clipboard. Paste the link into the box instead.");
    }
  }

  async function pickScreenshots() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_SCREENSHOTS,
      orderedSelection: true,
      quality: 1,
    });
    if (!result.canceled) setScreenshots(result.assets.slice(0, MAX_SCREENSHOTS));
  }

  async function submit(kind: "video" | "images") {
    if (!cookbook || !session) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "video") await addVideo(cookbook.id, link);
      else await addScreenshots(cookbook.id, session.user.id, screenshots);
      await reload();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setBusy(null);
    }
  }

  const linkValid = isVideoLink(link);

  return (
    <ScrollView
      style={{ backgroundColor: colors.paper }}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.section}>
        <Kicker>From a video</Kicker>
        <Heading size={30}>Paste a link</Heading>
        <Body soft>
          YouTube, Instagram, TikTok, Facebook, Pinterest and hundreds more. We'll watch the video, listen to it, read
          the caption, and write the recipe.
        </Body>
        <View style={styles.linkRow}>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="https://"
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Video link"
            style={[styles.input, { borderColor: colors.rule, backgroundColor: colors.surface, color: colors.ink }]}
          />
          {Platform.OS !== "web" && <Button label="Paste" variant="secondary" onPress={paste} />}
        </View>
        <Button
          label="Add from video"
          onPress={() => submit("video")}
          busy={busy === "video"}
          disabled={!linkValid || !!busy}
        />
      </View>

      <Rule style={{ marginVertical: 32 }} />

      <View style={styles.section}>
        <Kicker>From screenshots</Kicker>
        <Heading size={30}>Add screenshots</Heading>
        <Body soft>
          Pick screenshots of a recipe (a caption, a website, a cookbook page), in order. Up to {MAX_SCREENSHOTS}.
        </Body>
        {screenshots.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
            {screenshots.map((asset) => (
              <Image
                key={asset.uri}
                source={{ uri: asset.uri }}
                style={[styles.thumb, { borderColor: colors.rule }]}
                contentFit="cover"
              />
            ))}
          </ScrollView>
        )}
        <Button
          label={screenshots.length > 0 ? "Choose again" : "Choose screenshots"}
          variant="secondary"
          onPress={pickScreenshots}
          disabled={!!busy}
        />
        {screenshots.length > 0 && (
          <Button
            label={`Add from ${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"}`}
            onPress={() => submit("images")}
            busy={busy === "images"}
            disabled={!!busy}
          />
        )}
      </View>

      {error && <Body style={{ color: colors.berry, marginTop: 20 }}>{error}</Body>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, paddingBottom: 48 },
  section: { gap: 12 },
  linkRow: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 4 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  thumbs: { gap: 10, paddingVertical: 4 },
  thumb: { width: 84, height: 150, borderRadius: 10, borderWidth: 1 },
});
