function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See worker/.env.example.`);
  return value;
}

export const config = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  model: process.env.CLAUDE_MODEL ?? "claude-opus-5-5",
  whisperModel: process.env.WHISPER_MODEL ?? "small",
  ytDlpCookiesFile: process.env.YTDLP_COOKIES_FILE || null,
  ytDlpCookiesFromBrowser: process.env.YTDLP_COOKIES_FROM_BROWSER || null,
  maxVideoSeconds: Number(process.env.MAX_VIDEO_MINUTES ?? 45) * 60,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 3000),
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
};
