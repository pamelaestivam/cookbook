// Builds a single-file, clickable preview of the app: the web build, with
// fonts and images inlined and demo-backend.js standing in for Supabase.
//
// Usage: node preview/build.mjs [output.html]   (run from app/)

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(here, "..");
const repoDir = path.join(appDir, "..");
const output = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), "cookbook-preview.html"));
const dist = fs.mkdtempSync(path.join(os.tmpdir(), "cookbook-web-"));

execFileSync("npx", ["expo", "export", "--platform", "web", "--clear", "--output-dir", dist], {
  cwd: appDir,
  stdio: "inherit",
  env: {
    ...process.env,
    CI: "1",
    EXPO_PUBLIC_SUPABASE_URL: "https://demo.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "demo",
  },
});

const dataUri = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;

// Inline the fonts and images the bundle references by absolute path.
const bundleDir = path.join(dist, "_expo/static/js/web");
const bundleFile = fs.readdirSync(bundleDir).find((name) => name.endsWith(".js"));
let bundle = fs.readFileSync(path.join(bundleDir, bundleFile), "utf8");
const usedFonts = /(BodoniModa_(500Medium|500Medium_Italic|600SemiBold)|DMSans_(400Regular|500Medium|600SemiBold|700Bold))\./;
bundle = bundle.replace(/"(\/assets\/[^"]+\.(ttf|png))"/g, (match, assetPath, ext) => {
  if (ext === "ttf" && !usedFonts.test(assetPath)) return match;
  const file = path.join(dist, assetPath);
  if (!fs.existsSync(file)) return match;
  return JSON.stringify(dataUri(file, ext === "ttf" ? "font/ttf" : "image/png"));
});

// Sample data: the three recipes from the inspiration Recipe Book.
const inspiration = fs.readFileSync(path.join(repoDir, "docs/inspiration/recipe-book.html"), "utf8");
const cover = inspiration.match(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/)[0];
const demoData = {
  recipes: JSON.parse(fs.readFileSync(path.join(repoDir, "docs/inspiration/sample-recipes.json"), "utf8")),
  cookedRecipes: JSON.parse(fs.readFileSync(path.join(here, "cooked-recipes.json"), "utf8")),
  cover,
};

const safeScript = (code) => code.replace(/<\/script/gi, "<\\/script");
const template = fs.readFileSync(path.join(here, "template.html"), "utf8");
const html = template
  .replace("/*DEMO_DATA*/", () => `window.DEMO_DATA = ${safeScript(JSON.stringify(demoData))};`)
  .replace("/*DEMO_BACKEND*/", () => safeScript(fs.readFileSync(path.join(here, "demo-backend.js"), "utf8")))
  .replace("/*APP_BUNDLE*/", () => safeScript(bundle));

fs.writeFileSync(output, html);
fs.rmSync(dist, { recursive: true, force: true });
console.log(`Preview written to ${output} (${(html.length / 1024 / 1024).toFixed(1)} MB)`);
