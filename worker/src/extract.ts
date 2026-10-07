import { ApiError, createPartFromBase64, createPartFromUri, FileState, GoogleGenAI, type Part } from "@google/genai";
import { setTimeout as sleep } from "node:timers/promises";
import { config } from "./config.js";
import { Extraction, extractionJsonSchema } from "./recipe-schema.js";
import { UserFacingError, type VideoMetadata } from "./video.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

export interface SourceImage {
  data: Buffer;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  label: string;
}

export type ExtractionInput =
  | { kind: "video"; language: string; metadata: VideoMetadata; videoPath: string }
  | { kind: "images"; language: string; images: SourceImage[] };

const SYSTEM_PROMPT = `You turn cooking videos and recipe screenshots into chapters of a personal cookbook.

The reader will cook from your page without watching the video, so capture everything they need: every ingredient with its exact quantity, pan sizes, temperatures (give °C and °F), times, textures and visual cues to look for, and the tips the presenter stresses. Watch and listen to the whole video: quantities are often only spoken, or only shown as on-screen text, so cross-check what you hear, what you see, and the caption.

Write in the cookbook language you are given. When the source uses another language, translate everything, keep the original dish name in original_title, and keep untranslatable ingredient names with a short gloss in parentheses (e.g. "creme de leite (table cream)").

Be faithful to the source. Don't invent quantities or steps. When something is missing or ambiguous, choose the most sensible option and say so in a note (for example, "Oven temperature isn't stated in the video; 180°C / 350°F is typical for this cake"). Only fill nutrition when the source states it.

If the source isn't a recipe, set is_recipe to false and explain why in one sentence.`;

function describeVideo(language: string, metadata: VideoMetadata): string {
  const { title, uploader, platform, duration, webpageUrl, description } = metadata;
  return [
    `Cookbook language: ${language}`,
    "Source: the attached video",
    `URL: ${webpageUrl}`,
    title && `Title: ${title}`,
    uploader && `Creator: ${uploader}`,
    platform && `Platform: ${platform}`,
    duration && `Duration: ${Math.round(duration)} seconds`,
    description && `\nCaption / description:\n${description}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Uploads the video to Gemini and waits until it is ready to be read. */
async function uploadVideo(videoPath: string) {
  let file = await ai.files.upload({ file: videoPath, config: { mimeType: "video/mp4" } });
  const deadline = Date.now() + 5 * 60_000;
  while (file.state === FileState.PROCESSING && Date.now() < deadline) {
    await sleep(3000);
    file = await ai.files.get({ name: file.name! });
  }
  if (file.state !== FileState.ACTIVE) throw new Error(`Gemini could not process the video (state ${file.state}).`);
  return file;
}

export async function extractRecipes(input: ExtractionInput): Promise<Extraction> {
  const parts: Part[] = [];
  let uploadedName: string | undefined;

  if (input.kind === "video") {
    const file = await uploadVideo(input.videoPath);
    uploadedName = file.name;
    parts.push(createPartFromUri(file.uri!, file.mimeType!), { text: describeVideo(input.language, input.metadata) });
  } else {
    parts.push({
      text: `Cookbook language: ${input.language}\nSource: ${input.images.length} screenshot(s) the user took of a recipe, in the order they were added.`,
    });
    input.images.forEach((image, index) => {
      parts.push(
        { text: `Image ${index}: ${image.label}` },
        createPartFromBase64(image.data.toString("base64"), image.mediaType),
      );
    });
  }
  parts.push({ text: "Write the cookbook chapter for this recipe." });

  try {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: extractionJsonSchema(),
      },
    });

    if (response.promptFeedback?.blockReason) {
      throw new UserFacingError("This source couldn't be turned into a recipe.");
    }
    const text = response.text;
    if (!text) throw new Error(`Gemini returned no text (finish reason ${response.candidates?.[0]?.finishReason}).`);
    return Extraction.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      throw new UserFacingError(
        "The free Gemini quota is used up for now. Try again in a few minutes, or tomorrow if the daily limit was reached.",
        { cause: error },
      );
    }
    throw error;
  } finally {
    if (uploadedName) await ai.files.delete({ name: uploadedName }).catch(() => {});
  }
}
