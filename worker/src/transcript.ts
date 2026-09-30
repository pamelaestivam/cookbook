export interface Segment {
  start: number; // seconds
  text: string;
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function parseTime(value: string): number {
  const parts = value.trim().replace(",", ".").split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * Parses a WebVTT file into timestamped segments. Handles the rolling
 * auto-captions YouTube produces, where each cue repeats the previous line.
 */
export function parseVtt(vtt: string): Segment[] {
  const segments: Segment[] = [];
  const seen = new Set<string>();
  const blocks = vtt.replace(/\r/g, "").split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1) continue;
    const start = parseTime(lines[timingIndex].split("-->")[0]);

    for (const raw of lines.slice(timingIndex + 1)) {
      const text = raw
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      segments.push({ start, text });
    }
  }
  return segments;
}

/** Joins segments into lines prefixed with a timestamp roughly every 20 seconds. */
export function renderTranscript(segments: Segment[]): string {
  const lines: string[] = [];
  let current: { start: number; parts: string[] } | null = null;
  for (const segment of segments) {
    if (!current || segment.start - current.start >= 20) {
      if (current) lines.push(`[${formatTimestamp(current.start)}] ${current.parts.join(" ")}`);
      current = { start: segment.start, parts: [] };
    }
    current.parts.push(segment.text);
  }
  if (current) lines.push(`[${formatTimestamp(current.start)}] ${current.parts.join(" ")}`);
  return lines.join("\n");
}

type TrackMap = Record<string, unknown> | undefined | null;

/**
 * Picks the subtitle track to download from yt-dlp metadata. Prefers
 * captions written by the creator, then auto-captions in the spoken language.
 */
export function chooseSubtitleTrack(
  subtitles: TrackMap,
  automaticCaptions: TrackMap,
  language: string | null | undefined,
): { lang: string; automatic: boolean } | null {
  const manual = Object.keys(subtitles ?? {}).filter((key) => key !== "live_chat");
  const lang = language?.toLowerCase();
  const manualMatch =
    (lang && manual.find((key) => key.toLowerCase() === lang || key.toLowerCase().startsWith(`${lang}-`))) || manual[0];
  if (manualMatch) return { lang: manualMatch, automatic: false };

  // Auto-captions list every translation; "-orig" marks the spoken language.
  const automatic = Object.keys(automaticCaptions ?? {});
  const autoMatch =
    automatic.find((key) => key.endsWith("-orig")) ??
    (lang ? automatic.find((key) => key.toLowerCase() === lang) : undefined);
  if (autoMatch) return { lang: autoMatch, automatic: true };
  return null;
}
