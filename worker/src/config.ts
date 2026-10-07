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
  get geminiApiKey() {
    return required("GEMINI_API_KEY");
  },
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
  python: process.env.PYTHON ?? (process.platform === "win32" ? "py" : "python3"),
  ytDlpCookiesFile: process.env.YTDLP_COOKIES_FILE || null,
  ytDlpCookiesFromBrowser: process.env.YTDLP_COOKIES_FROM_BROWSER || null,
  maxVideoSeconds: Number(process.env.MAX_VIDEO_MINUTES ?? 20) * 60,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 3000),
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 1),
};
