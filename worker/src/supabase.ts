import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// The worker uses the service role key, which bypasses row level security.
// Keep it on the server; never ship it in the app.
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface ImportRow {
  id: string;
  owner_id: string;
  cookbook_id: string;
  kind: "video" | "images";
  source_url: string | null;
  image_paths: string[];
  attempts: number;
}
