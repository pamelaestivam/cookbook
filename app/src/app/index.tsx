import { Image } from "expo-image";
import { Link, router } from "expo-router";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { confirm, notify } from "@/components/dialog";
import { Body, Button, chapterNumber, Heading, Kicker } from "@/components/ui";
import { signOut } from "@/lib/auth";
import { dismissImport, retryImport, useCookbook } from "@/lib/cookbook";
import { fonts, useColors } from "@/lib/theme";
import type { Import } from "@/lib/types";

function importLabel(item: Import) {
  if (item.kind === "images") {
    const count = item.image_paths.length;
    return `${count} screenshot${count === 1 ? "" : "s"}`;
  }
  try {
    return new URL(item.source_url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return "Video";
  }
}

function InTheKitchen({ items, cookbookId }: { items: Import[]; cookbookId: string }) {
  const colors = useColors();
  const { reload } = useCookbook();
  const act = (fn: () => Promise<void>) =>
    fn()
      .then(reload)
      .catch((e: Error) => notify("Something went wrong", e.message));

  return (
    <View style={styles.section}>
      <Kicker>In the kitchen</Kicker>
      {items.map((item) => {
        const failed = item.status === "failed";
        return (
          <View
            key={item.id}
            style={[styles.importCard, { borderColor: colors.rule, backgroundColor: colors.surface }]}
          >
            <View style={styles.importHeader}>
              {!failed && <ActivityIndicator color={colors.berry} />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.importTitle, { color: colors.ink }]} numberOfLines={1}>
                  {importLabel(item)}
                </Text>
                <Body soft style={styles.importStatus}>
                  {failed
                    ? item.error
                    : item.status === "queued"
                      ? "Waiting its turn…"
                      : `${item.progress ?? "Working on it"}…`}
                </Body>
              </View>
            </View>
            {failed && (
              <View style={styles.importActions}>
                <Button label="Dismiss" variant="quiet" onPress={() => act(() => dismissImport(item.id))} />
                <Button
                  label="Try again"
                  variant="secondary"
                  onPress={() => act(() => retryImport(cookbookId, item))}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function Contents() {
  const colors = useColors();
  const { cookbook, recipes, imports, coverUrls, loading, error, reload } = useCookbook();

  if (loading || !cookbook) {
    return (
      <View style={[styles.center, { backgroundColor: colors.paper }]}>
        {error ? <Body>{error}</Body> : <ActivityIndicator color={colors.berry} />}
      </View>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.berry} />}
      >
        <View style={[styles.cover, { backgroundColor: colors.berryWash }]}>
          <Kicker>Kitchen collection</Kicker>
          <Heading size={60} style={styles.coverTitle}>
            {cookbook.title}
          </Heading>
          <Body soft>{cookbook.subtitle}</Body>
          <Text style={[styles.volume, { color: colors.inkSoft }]}>
            <Text style={{ color: colors.ink, fontFamily: fonts.bold }}>
              {recipes.length} {recipes.length === 1 ? "chapter" : "chapters"}
            </Text>
            {recipes.length > 0 ? " · Recipes from the videos you love" : ""}
          </Text>
          <Button label="Add a recipe" onPress={() => router.push("/add")} style={styles.addButton} />
        </View>

        {imports.length > 0 && <InTheKitchen items={imports} cookbookId={cookbook.id} />}

        <View style={styles.section}>
          <Kicker>Inside this volume</Kicker>
          <Heading size={36}>Contents</Heading>
          {recipes.length === 0 && (
            <Body soft style={{ marginTop: 12 }}>
              Your cookbook is empty. Add a link to a cooking video from YouTube, Instagram, TikTok and more, or
              screenshots of a recipe, and it will appear here as your first chapter.
            </Body>
          )}
          {recipes.map((recipe, index) => {
            const cover = recipe.cover_path ? coverUrls[recipe.cover_path] : undefined;
            return (
              <Link key={recipe.id} href={{ pathname: "/recipe/[id]", params: { id: recipe.id } }} asChild>
                <Pressable
                  style={({ pressed }) => [
                    styles.entry,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.rule },
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <View style={styles.entryRow}>
                    <Text style={[styles.entryNumber, { color: colors.berry }]}>{chapterNumber(index + 1)}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.entryTitle, { color: colors.ink }]}>{recipe.title}</Text>
                      <Body soft style={styles.entryTagline}>
                        {recipe.content.tagline}
                      </Body>
                    </View>
                    {cover ? (
                      <Image source={{ uri: cover }} style={styles.thumb} contentFit="cover" transition={200} />
                    ) : (
                      <Text style={[styles.arrow, { color: colors.berry }]}>→</Text>
                    )}
                  </View>
                </Pressable>
              </Link>
            );
          })}
        </View>

        <View style={[styles.footer, { borderColor: colors.rule }]}>
          <Kicker style={{ color: colors.sage }}>The collection continues</Kicker>
          <Heading size={28}>More recipes coming.</Heading>
          <Button
            label="Sign out"
            variant="quiet"
            onPress={() =>
              confirm("Sign out?", undefined, "Sign out").then((yes) => {
                if (yes) signOut();
              })
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  page: { paddingBottom: 48 },
  cover: { padding: 28, paddingTop: 36, gap: 10 },
  coverTitle: { marginVertical: 4 },
  volume: { fontFamily: fonts.body, fontSize: 14, marginTop: 8 },
  addButton: { marginTop: 16, alignSelf: "flex-start" },
  section: { paddingHorizontal: 24, paddingTop: 36, gap: 10 },
  importCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  importHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  importTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  importStatus: { fontSize: 14, lineHeight: 20 },
  importActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  entry: { paddingVertical: 14 },
  entryRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  entryNumber: { fontFamily: fonts.display, fontSize: 30, width: 44 },
  entryTitle: { fontFamily: fonts.displayMedium, fontSize: 21, lineHeight: 25 },
  entryTagline: { fontSize: 14, lineHeight: 20 },
  arrow: { fontSize: 22 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  footer: { margin: 24, marginTop: 40, paddingTop: 28, borderTopWidth: 1, alignItems: "center", gap: 8 },
});
