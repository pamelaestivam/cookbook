import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractRecipes, type ExtractionInput, type SourceImage } from "./extract.js";
import type { Recipe } from "./recipe-schema.js";
import { supabase, type ImportRow } from "./supabase.js";
import { downloadVideo, extractFrame, UserFacingError } from "./video.js";

const MAX_ATTEMPTS = 3;

async function setProgress(job: ImportRow, progress: string) {
  await supabase.from("imports").update({ progress }).eq("id", job.id);
}

function mediaTypeFor(filePath: string): SourceImage["mediaType"] {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

async function loadScreenshots(job: ImportRow): Promise<SourceImage[]> {
  return Promise.all(
    job.image_paths.map(async (imagePath, index) => {
      const { data, error } = await supabase.storage.from("uploads").download(imagePath);
      if (error) throw new Error(`Could not download ${imagePath}: ${error.message}`);
      return {
        data: Buffer.from(await data.arrayBuffer()),
        mediaType: mediaTypeFor(imagePath),
        label: `screenshot ${index + 1} of ${job.image_paths.length}`,
      };
    }),
  );
}

interface Gathered {
  input: ExtractionInput;
  videoPath: string | null;
  fallbackCover: SourceImage | null;
  source: { url: string | null; platform: string | null; author: string | null };
}

async function gatherVideo(job: ImportRow, language: string, workDir: string): Promise<Gathered> {
  await setProgress(job, "Downloading the video");
  const video = await downloadVideo(job.source_url!, workDir);
  return {
    input: { kind: "video", language, metadata: video.metadata, videoPath: video.videoPath },
    videoPath: video.videoPath,
    fallbackCover: video.thumbnailPath
      ? { data: await readFile(video.thumbnailPath), mediaType: "image/jpeg", label: "thumbnail" }
      : null,
    source: { url: video.metadata.webpageUrl, platform: video.metadata.platform, author: video.metadata.uploader },
  };
}

/** Picks the cover: the moment or screenshot Gemini chose, else the video thumbnail. */
async function chooseCover(recipe: Recipe, gathered: Gathered, workDir: string): Promise<SourceImage | null> {
  const { input } = gathered;
  if (input.kind === "images" && recipe.cover_image_index !== null) {
    return input.images[recipe.cover_image_index] ?? null;
  }
  if (gathered.videoPath && recipe.cover_time_seconds !== null) {
    try {
      const framePath = path.join(workDir, `cover-${randomUUID()}.jpg`);
      await extractFrame(gathered.videoPath, recipe.cover_time_seconds, framePath);
      return { data: await readFile(framePath), mediaType: "image/jpeg", label: "cover" };
    } catch {
      // Fall back to the thumbnail.
    }
  }
  return gathered.fallbackCover;
}

async function uploadCover(ownerId: string, recipeId: string, image: SourceImage): Promise<string> {
  const extension = image.mediaType.split("/")[1].replace("jpeg", "jpg");
  const coverPath = `${ownerId}/${recipeId}.${extension}`;
  const { error } = await supabase.storage
    .from("covers")
    .upload(coverPath, image.data, { contentType: image.mediaType, upsert: true });
  if (error) throw new Error(`Could not upload cover: ${error.message}`);
  return coverPath;
}

async function saveRecipes(job: ImportRow, recipes: Recipe[], gathered: Gathered, workDir: string) {
  const { data: last, error: positionError } = await supabase
    .from("recipes")
    .select("position")
    .eq("cookbook_id", job.cookbook_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (positionError) throw positionError;
  let position = (last?.position ?? 0) + 1;

  const rows = [];
  for (const recipe of recipes) {
    const { cover_image_index: _index, cover_time_seconds: _time, ...content } = recipe;
    const id = randomUUID();
    const cover = await chooseCover(recipe, gathered, workDir);
    rows.push({
      id,
      owner_id: job.owner_id,
      cookbook_id: job.cookbook_id,
      import_id: job.id,
      title: content.title,
      category: content.category,
      position: position++,
      source_url: gathered.source.url,
      source_platform: gathered.source.platform,
      source_author: gathered.source.author,
      cover_path: cover ? await uploadCover(job.owner_id, id, cover) : null,
      content,
    });
  }
  const { error } = await supabase.from("recipes").insert(rows);
  if (error) throw error;
}

export async function processImport(job: ImportRow): Promise<void> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), `import-${job.id}-`));
  try {
    const { data: cookbook, error } = await supabase
      .from("cookbooks")
      .select("language")
      .eq("id", job.cookbook_id)
      .single();
    if (error) throw error;

    const gathered: Gathered =
      job.kind === "video"
        ? await gatherVideo(job, cookbook.language, workDir)
        : {
            input: { kind: "images", language: cookbook.language, images: await loadScreenshots(job) },
            videoPath: null,
            fallbackCover: null,
            source: { url: null, platform: null, author: null },
          };

    await setProgress(job, job.kind === "video" ? "Watching the video" : "Reading your screenshots");
    const extraction = await extractRecipes(gathered.input);
    if (!extraction.is_recipe || extraction.recipes.length === 0) {
      throw new UserFacingError(extraction.reason ?? "We couldn't find a recipe here.");
    }

    await setProgress(job, "Adding it to your cookbook");
    await saveRecipes(job, extraction.recipes, gathered, workDir);
    await supabase.from("imports").update({ status: "done", progress: null, locked_at: null }).eq("id", job.id);
    console.log(`[${job.id}] added ${extraction.recipes.length} recipe(s)`);
  } catch (error) {
    const userFacing = error instanceof UserFacingError;
    const retry = !userFacing && job.attempts < MAX_ATTEMPTS;
    console.error(`[${job.id}] attempt ${job.attempts} failed${retry ? ", will retry" : ""}:`, error);
    await supabase
      .from("imports")
      .update({
        status: retry ? "queued" : "failed",
        progress: null,
        locked_at: null,
        error: userFacing
          ? error.message
          : retry
            ? null
            : "Something went wrong while reading this recipe. Please try again.",
      })
      .eq("id", job.id);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
