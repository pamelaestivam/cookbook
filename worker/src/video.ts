import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { run } from "./exec.js";
import { chooseSubtitleTrack, parseVtt, renderTranscript, type Segment } from "./transcript.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export interface VideoMetadata {
  title: string | null;
  description: string | null;
  uploader: string | null;
  platform: string | null;
  duration: number | null;
  webpageUrl: string;
}

export interface Frame {
  path: string;
  seconds: number;
}

export interface DownloadedVideo {
  metadata: VideoMetadata;
  videoPath: string;
  transcript: string | null;
  transcriptSource: "captions" | "speech" | null;
  thumbnailPath: string | null;
}

export class UserFacingError extends Error {}

/** Runs yt-dlp through Python, which works even when its script isn't on the PATH (common on Windows). */
function ytDlp(args: string[], options: { cwd?: string; timeoutMs?: number }) {
  return run(config.python, ["-m", "yt_dlp", ...args], options);
}

function ytDlpBaseArgs(): string[] {
  const args = ["--no-playlist", "--no-warnings", "--socket-timeout", "30"];
  if (config.ytDlpCookiesFile) args.push("--cookies", config.ytDlpCookiesFile);
  if (config.ytDlpCookiesFromBrowser) args.push("--cookies-from-browser", config.ytDlpCookiesFromBrowser);
  return args;
}

/** Downloads a video from any site yt-dlp supports, plus captions and a thumbnail. */
export async function downloadVideo(url: string, workDir: string): Promise<DownloadedVideo> {
  let info: Record<string, any>;
  try {
    info = JSON.parse(await ytDlp([...ytDlpBaseArgs(), "--dump-single-json", url], { timeoutMs: 120_000 }));
  } catch (error) {
    throw new UserFacingError(
      "We couldn't open this link. Check that the video is public, or add the recipe from screenshots instead.",
      { cause: error },
    );
  }

  const duration = typeof info.duration === "number" ? info.duration : null;
  if (duration !== null && duration > config.maxVideoSeconds) {
    throw new UserFacingError(
      `This video is ${Math.round(duration / 60)} minutes long. Videos up to ${Math.round(config.maxVideoSeconds / 60)} minutes are supported.`,
    );
  }

  const track = chooseSubtitleTrack(info.subtitles, info.automatic_captions, info.language);
  const args = [
    ...ytDlpBaseArgs(),
    "-f",
    "bv*[height<=720]+ba/b[height<=720]/bv*+ba/b",
    "--merge-output-format",
    "mp4",
    "--max-filesize",
    "800M",
    "-o",
    "video.%(ext)s",
    "--write-thumbnail",
    "--convert-thumbnails",
    "jpg",
  ];
  if (track) {
    args.push(track.automatic ? "--write-auto-subs" : "--write-subs", "--sub-langs", track.lang, "--sub-format", "vtt");
  }
  args.push(info.webpage_url ?? url);
  await ytDlp(args, { cwd: workDir, timeoutMs: 15 * 60_000 });

  const files = await readdir(workDir);
  const video = files.find((file) => file.startsWith("video.") && /\.(mp4|webm|mkv|mov)$/.test(file));
  if (!video) throw new UserFacingError("The video could not be downloaded.");
  const subtitle = files.find((file) => file.endsWith(".vtt"));
  const thumbnail = files.find((file) => file.endsWith(".jpg"));
  const videoPath = path.join(workDir, video);

  let transcript: string | null = null;
  let transcriptSource: DownloadedVideo["transcriptSource"] = null;
  if (subtitle) {
    const segments = parseVtt(await readFile(path.join(workDir, subtitle), "utf8"));
    if (segments.length > 0) {
      transcript = renderTranscript(segments);
      transcriptSource = "captions";
    }
  }
  if (!transcript) {
    transcript = await transcribeSpeech(videoPath, workDir);
    if (transcript) transcriptSource = "speech";
  }

  return {
    metadata: {
      title: info.title ?? null,
      description: info.description ?? null,
      uploader: info.uploader ?? info.channel ?? info.creator ?? null,
      platform: info.extractor_key ?? info.extractor ?? null,
      duration,
      webpageUrl: info.webpage_url ?? url,
    },
    videoPath,
    transcript,
    transcriptSource,
    thumbnailPath: thumbnail ? path.join(workDir, thumbnail) : null,
  };
}

/** Speech-to-text with faster-whisper for videos without captions. */
async function transcribeSpeech(videoPath: string, workDir: string): Promise<string | null> {
  const audioPath = path.join(workDir, "audio.wav");
  try {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", audioPath]);
  } catch {
    return null; // No audio track.
  }
  const output = await run(config.python, [path.join(here, "..", "transcribe.py"), audioPath, config.whisperModel], {
    timeoutMs: 30 * 60_000,
  });
  const segments = JSON.parse(output) as Segment[];
  return segments.length > 0 ? renderTranscript(segments) : null;
}

/** How many frames to show Claude: about one every 8 seconds, between 8 and 30. */
export function frameCount(durationSeconds: number): number {
  return Math.min(30, Math.max(8, Math.round(durationSeconds / 8)));
}

/** Samples evenly spaced frames, with the longest side scaled to 768 px. */
export async function extractFrames(videoPath: string, durationSeconds: number, workDir: string): Promise<Frame[]> {
  const count = frameCount(durationSeconds);
  const interval = durationSeconds / count;
  const frames: Frame[] = [];
  for (let i = 0; i < count; i++) {
    const seconds = interval * (i + 0.5);
    const framePath = path.join(workDir, `frame-${String(i).padStart(2, "0")}.jpg`);
    await run("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-ss",
      seconds.toFixed(2),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      "scale='if(gt(iw,ih),min(768,iw),-2)':'if(gt(iw,ih),-2,min(768,ih))'",
      "-q:v",
      "4",
      framePath,
    ]);
    frames.push({ path: framePath, seconds });
  }
  return frames;
}

/** Reads the real duration from the file when the site didn't report one. */
export async function probeDuration(videoPath: string): Promise<number> {
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  const duration = Number.parseFloat(output);
  if (!Number.isFinite(duration) || duration <= 0) throw new UserFacingError("The downloaded video is empty.");
  return duration;
}
