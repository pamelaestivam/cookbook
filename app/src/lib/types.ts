// Mirrors worker/src/recipe-schema.ts, which defines what Claude writes.

export interface IngredientGroup {
  name: string;
  items: string[];
}

export interface MethodSection {
  name: string;
  steps: string[];
}

export interface Note {
  title: string;
  body: string;
}

export interface Nutrition {
  per: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export interface RecipeContent {
  title: string;
  original_title: string | null;
  category: string;
  tagline: string;
  summary: string;
  highlights: string[];
  yield: string | null;
  ingredient_groups: IngredientGroup[];
  method_sections: MethodSection[];
  notes: Note[];
  nutrition: Nutrition | null;
}

export interface Recipe {
  id: string;
  cookbook_id: string;
  title: string;
  category: string | null;
  position: number;
  source_url: string | null;
  source_platform: string | null;
  source_author: string | null;
  cover_path: string | null;
  content: RecipeContent;
  created_at: string;
}

export interface Cookbook {
  id: string;
  title: string;
  subtitle: string;
  language: string;
}

export type ImportStatus = "queued" | "processing" | "done" | "failed";

export interface Import {
  id: string;
  kind: "video" | "images";
  source_url: string | null;
  image_paths: string[];
  status: ImportStatus;
  progress: string | null;
  error: string | null;
  created_at: string;
}
