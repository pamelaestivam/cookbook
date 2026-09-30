import { Image } from "expo-image";
import { Link, router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Button, chapterNumber, Chip, Heading, Kicker, Rule } from "@/components/ui";
import { deleteRecipe, useCookbook } from "@/lib/cookbook";
import { fonts, useColors, type Colors } from "@/lib/theme";
import type { Nutrition, Recipe } from "@/lib/types";

function sourceName(recipe: Recipe) {
  const platform = recipe.source_platform?.replace(/^Youtube$/i, "YouTube");
  if (recipe.source_author && platform) return `${recipe.source_author}'s ${platform} video`;
  if (recipe.source_author) return `${recipe.source_author}'s video`;
  return platform ? `${platform} video` : "video";
}

function NutritionCard({ nutrition, colors }: { nutrition: Nutrition; colors: Colors }) {
  const facts = [
    nutrition.calories !== null && `~${nutrition.calories} cal`,
    nutrition.protein_g !== null && `~${nutrition.protein_g} g protein`,
    nutrition.carbs_g !== null && `~${nutrition.carbs_g} g carbs`,
    nutrition.fat_g !== null && `~${nutrition.fat_g} g fat`,
  ].filter(Boolean) as string[];
  if (facts.length === 0) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.paperDeep }]}>
      <Kicker style={{ color: colors.sage }}>Per {nutrition.per}</Kicker>
      <View style={styles.chips}>
        {facts.map((fact) => (
          <Chip key={fact}>{fact}</Chip>
        ))}
      </View>
    </View>
  );
}

export default function RecipePage() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { recipes, coverUrls } = useCookbook();
  const index = recipes.findIndex((r) => r.id === id);
  const recipe = recipes[index];

  if (!recipe) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.paper }]}>
        <Body soft>This recipe is no longer in your cookbook.</Body>
      </View>
    );
  }

  const { content } = recipe;
  const cover = recipe.cover_path ? coverUrls[recipe.cover_path] : undefined;
  const previous = recipes[index - 1];
  const next = recipes[index + 1];
  const chips = [
    ...content.highlights,
    ...(content.yield && !content.highlights.includes(content.yield) ? [content.yield] : []),
  ];

  function confirmDelete() {
    Alert.alert(`Remove “${recipe.title}”?`, "It will be removed from your cookbook.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          deleteRecipe(recipe.id)
            .then(() => router.back())
            .catch((e: Error) => Alert.alert("Couldn't remove the recipe", e.message)),
      },
    ]);
  }

  return (
    <ScrollView style={{ backgroundColor: colors.paper }} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={styles.cover}
          contentFit="cover"
          transition={250}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={{ height: insets.top + 110, backgroundColor: colors.berryWash }} />
      )}

      <View style={[styles.header, { backgroundColor: colors.surface, borderColor: colors.rule }]}>
        <Text style={[styles.meta, { color: colors.inkSoft }]}>
          Recipe {index + 1} of {recipes.length}
        </Text>
        <Text style={[styles.number, { color: colors.berry }]}>{chapterNumber(index + 1)}</Text>
        <Kicker>{content.category}</Kicker>
        <Heading size={40} style={{ marginTop: 6 }}>
          {content.title}
        </Heading>
        {content.original_title && (
          <Text style={[styles.original, { color: colors.inkSoft }]}>({content.original_title})</Text>
        )}
        <Body style={{ marginTop: 12 }}>{content.summary}</Body>
        {chips.length > 0 && (
          <View style={styles.chips}>
            {chips.map((chip) => (
              <Chip key={chip}>{chip}</Chip>
            ))}
          </View>
        )}
        {recipe.source_url && (
          <Pressable
            accessibilityRole="link"
            onPress={() => WebBrowser.openBrowserAsync(recipe.source_url!)}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 18 })}
          >
            <Text style={[styles.sourceLink, { color: colors.berryDark }]}>Watch {sourceName(recipe)} ↗</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <Kicker>Mise en place</Kicker>
        <Heading size={32}>Ingredients</Heading>
        {content.ingredient_groups.map((group) => (
          <View key={group.name} style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.berryDark }]}>{group.name}</Text>
            {group.items.map((item, i) => (
              <View key={i} style={styles.ingredient}>
                <View style={[styles.bullet, { backgroundColor: colors.berry }]} />
                <Body style={{ flex: 1 }}>{item}</Body>
              </View>
            ))}
          </View>
        ))}
        {content.nutrition && <NutritionCard nutrition={content.nutrition} colors={colors} />}
      </View>

      {content.method_sections.length > 0 && <Rule style={{ marginHorizontal: 24 }} />}

      {content.method_sections.length > 0 && (
        <View style={styles.section}>
          <Kicker>Method</Kicker>
          <Heading size={32}>Make it</Heading>
          {content.method_sections.map((section) => (
            <View key={section.name} style={styles.group}>
              <Text style={[styles.groupTitle, { color: colors.berryDark }]}>{section.name}</Text>
              {section.steps.map((step, i) => (
                <View key={i} style={styles.step}>
                  <Text style={[styles.stepNumber, { color: colors.berry }]}>{i + 1}</Text>
                  <Body style={{ flex: 1 }}>{step}</Body>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {content.notes.length > 0 && (
        <View style={[styles.section, { paddingTop: 0 }]}>
          {content.notes.map((note, i) => (
            <View key={i} style={[styles.card, { backgroundColor: colors.berryWash }]}>
              <Body>
                <Text style={{ fontFamily: fonts.bold }}>{note.title}: </Text>
                {note.body}
              </Body>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.pager, { borderColor: colors.rule }]}>
        {[
          { recipe: previous, label: "← Previous recipe", fallback: "Beginning of the book" },
          { recipe: next, label: "Next recipe →", fallback: "End of the book" },
        ].map(({ recipe: target, label, fallback }) =>
          target ? (
            <Link key={label} href={{ pathname: "/recipe/[id]", params: { id: target.id } }} replace asChild>
              <Pressable style={styles.pagerItem}>
                <Text style={[styles.meta, { color: colors.inkSoft }]}>{label}</Text>
                <Text style={[styles.pagerTitle, { color: colors.ink }]}>{target.title}</Text>
              </Pressable>
            </Link>
          ) : (
            <View key={label} style={styles.pagerItem}>
              <Text style={[styles.meta, { color: colors.inkSoft }]}>{fallback}</Text>
            </View>
          ),
        )}
      </View>

      <Button label="Remove from cookbook" variant="quiet" onPress={confirmDelete} style={{ alignSelf: "center" }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  cover: { width: "100%", aspectRatio: 4 / 5, maxHeight: 520 },
  header: { marginTop: -28, marginHorizontal: 12, borderRadius: 24, borderWidth: 1, padding: 24 },
  meta: { fontFamily: fonts.medium, fontSize: 13 },
  number: { fontFamily: fonts.display, fontSize: 56, lineHeight: 64 },
  original: { fontFamily: fonts.displayItalic, fontSize: 20, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  sourceLink: { fontFamily: fonts.semibold, fontSize: 15 },
  section: { padding: 24, paddingTop: 36, gap: 8 },
  group: { marginTop: 16, gap: 8 },
  groupTitle: { fontFamily: fonts.bold, fontSize: 15, letterSpacing: 0.3 },
  ingredient: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 11 },
  step: { flexDirection: "row", gap: 14, alignItems: "flex-start", marginTop: 4 },
  stepNumber: { fontFamily: fonts.display, fontSize: 22, width: 26, lineHeight: 28 },
  card: { borderRadius: 16, padding: 16, marginTop: 12 },
  pager: { flexDirection: "row", marginHorizontal: 24, marginVertical: 24, borderTopWidth: 1, borderBottomWidth: 1 },
  pagerItem: { flex: 1, paddingVertical: 16, gap: 4 },
  pagerTitle: { fontFamily: fonts.displayMedium, fontSize: 17 },
});
