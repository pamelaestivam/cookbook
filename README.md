# Cookbook

Turn the cooking videos you love into your own cookbook. Paste a link from YouTube, Instagram, TikTok, or any
of the hundreds of sites [yt-dlp](https://github.com/yt-dlp/yt-dlp) supports, or add screenshots of a recipe. The app
watches the video, listens to it, reads the caption, and writes a cookbook chapter: ingredients, method, tips, and a
link back to the original.

The design follows the [Recipe Book](docs/inspiration/recipe-book.html) that inspired the project: a contents page
of numbered chapters, "Mise en place" ingredients, a numbered method, and notes.

<p>
  <img src="docs/screenshots/contents.png" width="300" alt="Contents screen with three chapters and an import in progress" />
  <img src="docs/screenshots/recipe.png" width="300" alt="Flourless Brownie recipe page" />
</p>

## How it works

```
 Expo app (iOS / Android)            Supabase                          Worker (Node, Docker)
 ─────────────────────────           ────────────────────────          ──────────────────────────────────────
 Sign in with an email code  ──────▶ Auth
 Paste link / pick screenshots ────▶ imports row (queued) ◀─ claims ── claim_next_import()
   screenshots ────────────────────▶ Storage: uploads/                  yt-dlp: video, caption, subtitles
                                                                        captions, or faster-whisper speech-to-text
                                                                        ffmpeg: 8–30 evenly spaced frames
                                                                        Claude: transcript + caption + frames
                                                                                → structured recipe JSON
 Live progress (Realtime)  ◀──────── imports.progress / status ◀─────── progress updates
 Contents & recipe pages   ◀──────── recipes rows, Storage: covers/ ◀── recipe rows + cover image
```

- **`app/`**: Expo (SDK 57) app built with Expo Router. Screens are in `app/src/app/`.
- **`worker/`**: Node worker that takes imports off the queue. `src/video.ts` downloads the video and pulls
  transcript and frames, `src/extract.ts` calls Claude, and `src/recipe-schema.ts` defines the recipe format.
- **`supabase/migrations/`**: tables, row level security, the job queue function, and storage buckets.

Claude gets the transcript, the caption (creators often put the quantities there), and frames from the video (for
quantities shown on screen). It returns the recipe through structured outputs, so the result always matches the
schema. It translates recipes into the cookbook's language and keeps the original dish name. Where the video leaves
something out, it fills the gap and says so in a note. A video that teaches several dishes becomes several chapters.

## Run it on your computer

The database is already set up: Supabase project **Cookbook** (`elckmwdxjcrohxydgsiz`, US East), with the schema in
`supabase/migrations/` applied. The app's public connection settings are in `app/.env`. The worker runs on your
computer: it only processes videos while your computer is on.

### 1. One-time setup in Supabase

People sign in with an email and password. So that new accounts work right away without a confirmation email,
turn off **Confirm email** in
[Authentication → Sign In / Providers → Email](https://supabase.com/dashboard/project/elckmwdxjcrohxydgsiz/auth/providers).
If you leave it on, new users get a confirmation link by email and sign in after opening it.

### 2. Start the worker

Get two keys:

- **Supabase secret key**: [Project Settings → API Keys](https://supabase.com/dashboard/project/elckmwdxjcrohxydgsiz/settings/api-keys)
- **Claude API key**: [platform.claude.com](https://platform.claude.com) → API Keys (the account needs credits)

```sh
cd worker
cp .env.example .env     # paste the two keys into .env
```

Then either, with [Docker Desktop](https://www.docker.com/products/docker-desktop/) (simplest):

```sh
docker compose up -d     # first build takes a few minutes; it restarts by itself after a reboot
docker compose logs -f   # watch it work
```

On **Windows** without Docker, open PowerShell and run:

```powershell
winget install Git.Git OpenJS.NodeJS.LTS Python.Python.3.12 Gyan.FFmpeg
# close and reopen PowerShell so the new programs are found, then:
git clone -b claude/nice-gates-rlm4m7 https://github.com/pamelaestivam/cookbook.git
cd cookbook\worker
py -m pip install -U yt-dlp faster-whisper
copy .env.example .env
notepad .env             # paste the two keys, save, close
npm install
npm start                # leave this window open; it processes videos while it runs
```

On a **Mac** without Docker (needs Node 22+, Python 3 and ffmpeg: `brew install node python ffmpeg`):

```sh
pip3 install -U yt-dlp faster-whisper
npm install
npm start
```

Without Docker you can also set `YTDLP_COOKIES_FROM_BROWSER=chrome` (or `safari`, `firefox`) in `.env`, so posts
that need a login on Instagram or TikTok download with your browser's logins. Keep yt-dlp current
(`pip3 install -U yt-dlp`, or `docker compose build --pull`), because video sites change often.

### 3. Open the app on your phone

Install **Expo Go** from the App Store or Google Play, then on your computer:

```sh
cd app
npm install
npx expo start           # scan the QR code with your phone's camera (iPhone) or Expo Go (Android)
```

Create an account with your email and a password, tap **Add a recipe**, and paste a video link. Your phone and computer need to be on the
same Wi-Fi network for Expo Go. To publish to the app stores later, build with `npx eas-cli@latest build`.

## Development

```sh
cd worker && npm run typecheck && npm test   # transcript parsing, frame extraction, schema
cd app && npm run typecheck
```

## Preview

`cd app && npm run preview -- preview.html` builds a single-file, clickable web preview. It runs with the sample
recipes from `docs/inspiration/` and a stand-in backend (`app/preview/demo-backend.js`) that simulates imports, so
it needs no Supabase project, API key or worker.

## Next steps

- **Share to the app**: accept links shared from Instagram or TikTok through the share sheet (for example with
  `expo-share-intent`; this needs a development build instead of Expo Go).
- **Edit recipes**: the database already allows editing `title`, `category`, `position` and `content`.
- **Settings**: a screen to rename the cookbook and choose its language (`cookbooks.language`, "English" by
  default).
- **Clean up storage**: delete cover images and screenshots when a recipe or import is removed.
- **Export**: print the cookbook or save it as a PDF, like the original Recipe Book page.
