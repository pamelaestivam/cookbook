import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { config } from "./config.js";
import { Extraction } from "./recipe-schema.js";
import { UserFacingError, type VideoMetadata } from "./video.js";

const client = new Anthropic();

export interface SourceImage {
  data: Buffer;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  label: string;
}

export interface ExtractionInput {
  kind: "video" | "images";
  language: string;
  metadata?: VideoMetadata;
  transcript?: string | null;
  images: SourceImage[];
}

const SYSTEM_PROMPT = `You turn cooking videos and recipe screenshots into chapters of a personal cookbook.

The reader will cook from your page without watching the video, so capture everything they need: every ingredient with its exact quantity, pan sizes, temperatures (give °C and °F), times, textures and visual cues to look for, and the tips the presenter stresses. Quantities often appear only on screen, so read the images carefully and cross-check them against the transcript and the caption.

Write in the cookbook language you are given. When the source uses another language, translate everything, keep the original dish name in original_title, and keep untranslatable ingredient names with a short gloss in parentheses (e.g. "creme de leite (table cream)").

Be faithful to the source. Don't invent quantities or steps. When something is missing or ambiguous, choose the most sensible option and say so in a note (for example, "Oven temperature isn't stated in the video; 180°C / 350°F is typical for this cake"). Only fill nutrition when the source states it.

If the source isn't a recipe, set is_recipe to false and explain why in one sentence.`;

function describeSource(input: ExtractionInput): string {
  const parts: Array<string | number | null | false> = [`Cookbook language: ${input.language}`];
  if (input.kind === "video" && input.metadata) {
    const { title, uploader, platform, duration, webpageUrl, description } = input.metadata;
    parts.push(
      "Source: video",
      `URL: ${webpageUrl}`,
      title && `Title: ${title}`,
      uploader && `Creator: ${uploader}`,
      platform && `Platform: ${platform}`,
      duration && `Duration: ${Math.round(duration)} seconds`,
      description && `\nCaption / description:\n${description}`,
      input.transcript
        ? `\nTranscript:\n${input.transcript}`
        : "\nTranscript: none (the video has no speech or captions).",
      `\nBelow are ${input.images.length} frames sampled evenly through the video, in order. On-screen text in them often holds the quantities.`,
    );
  } else {
    parts.push(`Source: ${input.images.length} screenshot(s) the user took of a recipe, in the order they were added.`);
  }
  return parts.filter(Boolean).join("\n");
}

export async function extractRecipes(input: ExtractionInput): Promise<Extraction> {
  const content: BetaContentBlockParam[] = [{ type: "text", text: describeSource(input) }];
  input.images.forEach((image, index) => {
    content.push(
      { type: "text", text: `Image ${index}: ${image.label}` },
      { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data.toString("base64") } },
    );
  });
  content.push({ type: "text", text: "Write the cookbook chapter for this recipe." });

  const response = await client.beta.messages.parse({
    model: config.model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
    output_config: { effort: "medium", format: betaZodOutputFormat(Extraction) },
    // On a safety decline, retry on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  if (response.stop_reason === "refusal") {
    throw new UserFacingError("This source couldn't be turned into a recipe.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude's response was cut off at max_tokens.");
  }
  if (!response.parsed_output) {
    throw new Error("Claude's response did not match the recipe schema.");
  }
  return response.parsed_output;
}
