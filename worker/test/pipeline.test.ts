import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "../src/exec.js";
import { Extraction } from "../src/recipe-schema.js";
import { chooseSubtitleTrack, formatTimestamp, parseVtt, renderTranscript } from "../src/transcript.js";
import { extractFrames, frameCount, probeDuration } from "../src/video.js";

describe("parseVtt", () => {
  it("drops tags and the repeated lines of rolling auto-captions", () => {
    const vtt = `WEBVTT
Kind: captions
Language: pt

00:00:01.000 --> 00:00:03.000 align:start position:0%
bata a manteiga<00:00:01.500><c> com o açúcar</c>

00:00:03.000 --> 00:00:05.000
bata a manteiga com o açúcar
até ficar &amp; fofo

00:01:02.500 --> 00:01:04.000
leve ao forno a 180 graus`;

    expect(parseVtt(vtt)).toEqual([
      { start: 1, text: "bata a manteiga com o açúcar" },
      { start: 3, text: "até ficar & fofo" },
      { start: 62.5, text: "leve ao forno a 180 graus" },
    ]);
  });

  it("renders timestamped paragraphs", () => {
    const text = renderTranscript([
      { start: 1, text: "a" },
      { start: 10, text: "b" },
      { start: 62.5, text: "c" },
    ]);
    expect(text).toBe("[0:01] a b\n[1:02] c");
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });
});

describe("chooseSubtitleTrack", () => {
  it("prefers creator captions in the video's language", () => {
    expect(chooseSubtitleTrack({ en: [], "pt-BR": [] }, { "pt-orig": [] }, "pt")).toEqual({
      lang: "pt-BR",
      automatic: false,
    });
  });

  it("falls back to auto-captions in the spoken language", () => {
    expect(chooseSubtitleTrack({ live_chat: [] }, { en: [], fr: [], "pt-orig": [], pt: [] }, "pt")).toEqual({
      lang: "pt-orig",
      automatic: true,
    });
  });

  it("returns null when there are no captions", () => {
    expect(chooseSubtitleTrack(undefined, {}, null)).toBeNull();
  });
});

describe("frames", () => {
  let dir: string;
  let video: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "frames-test-"));
    video = path.join(dir, "video.mp4");
    // A 20-second vertical test clip, like a Reel or TikTok.
    await run("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=720x1280:rate=10",
      "-t",
      "20",
      video,
    ]);
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("samples one frame about every 8 seconds, within bounds", () => {
    expect(frameCount(20)).toBe(8);
    expect(frameCount(160)).toBe(20);
    expect(frameCount(3600)).toBe(30);
  });

  it("extracts evenly spaced frames scaled to 768 px", async () => {
    const duration = await probeDuration(video);
    expect(duration).toBeCloseTo(20, 0);
    const frames = await extractFrames(video, duration, dir);
    expect(frames).toHaveLength(8);
    expect(frames[0].seconds).toBeCloseTo(1.25);
    for (const frame of frames) expect((await stat(frame.path)).size).toBeGreaterThan(0);
    const size = await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      frames[0].path,
    ]);
    expect(size.trim()).toBe("432,768");
  });
});

describe("recipe schema", () => {
  it("converts to a structured-output JSON schema", () => {
    const format = betaZodOutputFormat(Extraction);
    expect(format.type).toBe("json_schema");
    const parsed = format.parse(
      JSON.stringify({
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
            cover_image_index: 3,
          },
        ],
      }),
    );
    expect(parsed.recipes[0].original_title).toBe("Brownie Sem Farinha");
  });
});
