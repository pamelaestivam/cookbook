import { readdir } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { run } from "./exec.js";

export interface VideoMetadata {
  title: string | null;
  description: string | null;
  uploader: string | null;
  platform: string | null;
  duration: number | null;
  webpageUrl: string;
}

export interface DownloadedVideo {
  metadata: VideoMetadata;
  videoPath: string;
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

/** Downloads a video from any site yt-dlp supports, plus its thumbnail. */
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

  // 480p keeps uploads small; on-screen text is still readable at that size.
  await ytDlp(
    [
      ...ytDlpBaseArgs(),
      "-f",
      "bv*[height<=480]+ba/b[height<=480]/bv*+ba/b",
      "--merge-output-format",
      "mp4",
      "--max-filesize",
      "500M",
      "-o",
      "video.%(ext)s",
      "--write-thumbnail",
      "--convert-thumbnails",
      "jpg",
      info.webpage_url ?? url,
    ],
    { cwd: workDir, timeoutMs: 15 * 60_000 },
  );

  const files = await readdir(workDir);
  const video = files.find((file) => file.startsWith("video.") && /\.(mp4|webm|mkv|mov)$/.test(file));
  if (!video) throw new UserFacingError("The video could not be downloaded.");
  const thumbnail = files.find((file) => file.endsWith(".jpg"));

  return {
    metadata: {
      title: info.title ?? null,
      description: info.description ?? null,
      uploader: info.uploader ?? info.channel ?? info.creator ?? null,
      platform: info.extractor_key ?? info.extractor ?? null,
      duration,
      webpageUrl: info.webpage_url ?? url,
    },
    videoPath: path.join(workDir, video),
    thumbnailPath: thumbnail ? path.join(workDir, thumbnail) : null,
  };
}

/** Saves the frame at `seconds` as a JPEG, with the longest side at most 1080 px. */
export async function extractFrame(videoPath: string, seconds: number, outputPath: string): Promise<string> {
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    Math.max(0, seconds).toFixed(2),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-vf",
    "scale='if(gt(iw,ih),min(1080,iw),-2)':'if(gt(iw,ih),-2,min(1080,ih))'",
    "-q:v",
    "3",
    outputPath,
  ]);
  return outputPath;
}
