import { z } from "zod/v4";

// The shape Claude fills in for each recipe. It mirrors the chapters of the
// inspiration Recipe Book (docs/inspiration/recipe-book.html): a category
// kicker, title, original-language name, summary, quick-fact chips,
// "Mise en place" ingredient groups, method sections, and notes.
//
// Optional values are nullable rather than omitted so the schema stays
// compatible with structured outputs.

export const IngredientGroup = z.object({
  name: z
    .string()
    .describe(
      'Group heading, e.g. "Cake batter", "Brigadeiro filling". Use "Ingredients" when there is only one group.',
    ),
  items: z
    .array(z.string())
    .describe('One ingredient per entry, quantity first, e.g. "200 g unsalted butter, at room temperature".'),
});

export const MethodSection = z.object({
  name: z.string().describe('Section heading, e.g. "Cake batter", "Assembly".'),
  steps: z.array(z.string()).describe("Ordered steps, each one self-contained and actionable."),
});

export const Note = z.object({
  title: z.string().describe('Short lead-in, e.g. "From the video", "Use real chocolate".'),
  body: z.string(),
});

export const Nutrition = z.object({
  per: z.string().describe('What one portion is, e.g. "pancake", "slice", "serving".'),
  calories: z.number().nullable(),
  protein_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  fat_g: z.number().nullable(),
});

export const Recipe = z.object({
  title: z.string().describe("Recipe name in the cookbook language."),
  original_title: z
    .string()
    .nullable()
    .describe('Name in the source language when it differs, e.g. "Brownie Sem Farinha". Null otherwise.'),
  category: z
    .string()
    .describe('Chapter kicker such as "Cakes & celebration", "Chocolate & brownies", "Breakfast & protein".'),
  tagline: z
    .string()
    .describe('Three or four key elements joined by " · ", e.g. "Bittersweet chocolate · cocoa · no flour".'),
  summary: z.string().describe("Two or three sentences describing the dish and what makes it special."),
  highlights: z
    .array(z.string())
    .describe('Two to four quick-fact chips, e.g. "3 × 18 cm pans", "180°C / 350°F", "35 min bake", "Makes 30".'),
  yield: z.string().nullable().describe('e.g. "Makes 30 pancakes", "Serves 8". Null if unknown.'),
  ingredient_groups: z.array(IngredientGroup),
  method_sections: z.array(MethodSection),
  notes: z
    .array(Note)
    .describe("Tips, substitutions, and anything the presenter stressed. Also flag assumptions you had to make."),
  nutrition: Nutrition.nullable().describe("Only when the source states nutrition. Never estimate."),
  cover_image_index: z
    .number()
    .int()
    .nullable()
    .describe("For screenshots: index of the image that best shows the finished dish, or null if none does."),
  cover_time_seconds: z
    .number()
    .nullable()
    .describe("For videos: the moment, in seconds from the start, that best shows the finished dish. Null otherwise."),
});

export const Extraction = z.object({
  is_recipe: z.boolean().describe("False when the source does not contain a recipe that can be cooked."),
  reason: z
    .string()
    .nullable()
    .describe("When is_recipe is false, a one-sentence explanation for the user. Null otherwise."),
  recipes: z.array(Recipe).describe("Usually one. More only when the source clearly teaches several separate dishes."),
});

/** JSON Schema for Gemini's structured output. */
export function extractionJsonSchema(): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(Extraction) as Record<string, unknown>;
  return schema;
}

export type Recipe = z.infer<typeof Recipe>;
export type Extraction = z.infer<typeof Extraction>;
