import type { ImagePickerAsset } from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { supabase } from "./supabase";
import type { Cookbook, Import, Recipe } from "./types";

interface CookbookState {
  cookbook: Cookbook | null;
  recipes: Recipe[];
  /** Imports still in the kitchen, or failed ones the user hasn't dismissed. */
  imports: Import[];
  coverUrls: Record<string, string>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const CookbookContext = createContext<CookbookState | null>(null);

export function CookbookProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [state, setState] = useState<Omit<CookbookState, "reload">>({
    cookbook: null,
    recipes: [],
    imports: [],
    coverUrls: {},
    loading: true,
    error: null,
  });

  const reload = useCallback(async () => {
    if (!userId) return;
    const [cookbooks, recipes, imports] = await Promise.all([
      supabase.from("cookbooks").select("id, title, subtitle, language").order("created_at").limit(1).single(),
      supabase.from("recipes").select("*").order("position"),
      supabase.from("imports").select("*").neq("status", "done").order("created_at", { ascending: false }),
    ]);
    const error = cookbooks.error ?? recipes.error ?? imports.error;
    if (error) {
      setState((s) => ({ ...s, loading: false, error: error.message }));
      return;
    }

    const recipeRows = (recipes.data ?? []) as Recipe[];
    const coverPaths = recipeRows.map((r) => r.cover_path).filter((p): p is string => !!p);
    const coverUrls: Record<string, string> = {};
    if (coverPaths.length > 0) {
      const { data } = await supabase.storage.from("covers").createSignedUrls(coverPaths, 60 * 60 * 24);
      for (const item of data ?? []) if (item.path && item.signedUrl) coverUrls[item.path] = item.signedUrl;
    }

    setState({
      cookbook: cookbooks.data as Cookbook,
      recipes: recipeRows,
      imports: (imports.data ?? []) as Import[],
      coverUrls,
      loading: false,
      error: null,
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    reload();
    // Imports move through the queue on the worker; follow along live.
    const channel = supabase
      .channel(`cookbook-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "imports", filter: `owner_id=eq.${userId}` },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recipes", filter: `owner_id=eq.${userId}` },
        reload,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, reload]);

  // Realtime can drop events (for example while the app is in the background),
  // so also check every few seconds while something is in the kitchen.
  const cooking = state.imports.some((item) => item.status === "queued" || item.status === "processing");
  useEffect(() => {
    if (!cooking) return;
    const timer = setInterval(reload, 4000);
    return () => clearInterval(timer);
  }, [cooking, reload]);

  const value = useMemo(() => ({ ...state, reload }), [state, reload]);
  return <CookbookContext.Provider value={value}>{children}</CookbookContext.Provider>;
}

export function useCookbook(): CookbookState {
  const value = useContext(CookbookContext);
  if (!value) throw new Error("useCookbook must be used inside CookbookProvider");
  return value;
}

export function isVideoLink(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function addVideo(cookbookId: string, url: string) {
  const { error } = await supabase
    .from("imports")
    .insert({ cookbook_id: cookbookId, kind: "video", source_url: url.trim() });
  if (error) throw error;
}

// Claude reads images best at up to about 1568 px on the long edge.
const MAX_EDGE = 1568;

async function toUploadableJpeg(asset: ImagePickerAsset): Promise<ArrayBuffer> {
  const context = ImageManipulator.manipulate(asset.uri);
  const longEdge = Math.max(asset.width, asset.height);
  if (longEdge > MAX_EDGE) {
    context.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return (await fetch(result.uri)).arrayBuffer();
}

export async function addScreenshots(cookbookId: string, userId: string, assets: ImagePickerAsset[]) {
  const batch = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const paths = await Promise.all(
    assets.map(async (asset, index) => {
      const path = `${userId}/${batch}/${String(index).padStart(2, "0")}.jpg`;
      const { error } = await supabase.storage
        .from("uploads")
        .upload(path, await toUploadableJpeg(asset), { contentType: "image/jpeg" });
      if (error) throw error;
      return path;
    }),
  );
  const { error } = await supabase
    .from("imports")
    .insert({ cookbook_id: cookbookId, kind: "images", image_paths: paths });
  if (error) throw error;
}

/** Queues a failed import again with the same link or screenshots. */
export async function retryImport(cookbookId: string, failed: Import) {
  const { error } = await supabase.from("imports").insert({
    cookbook_id: cookbookId,
    kind: failed.kind,
    source_url: failed.source_url,
    image_paths: failed.image_paths,
  });
  if (error) throw error;
  await dismissImport(failed.id);
}

export async function dismissImport(id: string) {
  const { error } = await supabase.from("imports").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteRecipe(id: string) {
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw error;
}
