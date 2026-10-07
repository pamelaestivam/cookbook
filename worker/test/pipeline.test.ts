import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "../src/exec.js";
import { Extraction, extractionJsonSchema } from "../src/recipe-schema.js";
import { extractFrame } from "../src/video.js";

describe("extractFrame", () => {
  let dir: string;
  let video: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "frames-test-"));
    video = path.join(dir, "video.mp4");
    // A 10-second vertical test clip, like a Reel or TikTok.
    await run("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=720x1280:rate=10",
      "-t",
      "10",
      video,
    ]);
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("saves the frame at a given moment, keeping its size under 1080 px", async () => {
    const framePath = await extractFrame(video, 4.5, path.join(dir, "cover.jpg"));
    expect((await stat(framePath)).size).toBeGreaterThan(0);
    const size = await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      framePath,
    ]);
    expect(size.trim()).toBe("608,1080");
  });
});

describe("recipe schema", () => {
  const sample = {
    is_recipe: true,
    reason: null,
    recipes: [
      {
        title: "Flourless Brownie",
        original_title: "Brownie Sem Farinha",
        category: "Chocolate & brownies",
        tagline: "Bittersweet chocolate · cocoa · no flour",
        summary: "A fudgy brownie made without flour.",
        highlights: ["5 ingredients", "No flour"],
        yield: null,
        ingredient_groups: [{ name: "Brownie batter", items: ["210 g bittersweet chocolate"] }],
        method_sections: [{ name: "Mix & bake", steps: ["Melt the chocolate."] }],
        notes: [],
        nutrition: null,
        cover_image_index: null,
        cover_time_seconds: 42.5,
      },
    ],
  };

  it("converts to a JSON Schema for Gemini", () => {
    const schema = extractionJsonSchema();
    expect(schema).not.toHaveProperty("$schema");
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["is_recipe", "reason", "recipes"]);
  });

  it("parses a model response", () => {
    const parsed = Extraction.parse(JSON.parse(JSON.stringify(sample)));
    expect(parsed.recipes[0].cover_time_seconds).toBe(42.5);
  });

  it("rejects a response missing required fields", () => {
    expect(() => Extraction.parse({ is_recipe: true, recipes: [{ title: "x" }] })).toThrow();
  });
});
