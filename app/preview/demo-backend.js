// A stand-in for Supabase so the web build runs with sample data and no
// server. It answers the requests the app makes (auth, recipes, imports,
// storage) from memory, and pretends to cook each new import: it moves
// through the worker's progress steps and then adds a sample recipe.
//
// build.mjs injects this ahead of the app bundle, with DEMO_DATA defined.
(() => {
  const HOST = "https://demo.supabase.co";
  const { recipes: sampleRecipes, cover, cookedRecipes } = window.DEMO_DATA;
  const userId = "00000000-0000-4000-8000-000000000001";
  const cookbookId = "00000000-0000-4000-8000-0000000000c0";

  // Expo Router reads the path; the preview can be served from any path.
  try {
    history.replaceState(null, "", "/");
  } catch {}

  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "cook@example.com",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  function session() {
    const now = Math.floor(Date.now() / 1000);
    return {
      access_token: "demo",
      refresh_token: "demo",
      token_type: "bearer",
      expires_in: 86400,
      expires_at: now + 86400,
      user,
    };
  }
  // Start signed in, so the preview opens on the cookbook.
  try {
    localStorage.setItem("sb-demo-auth-token", JSON.stringify(session()));
  } catch {}

  const blobs = new Map(); // storage path -> object URL
  blobs.set(`${userId}/r1.jpg`, cover);

  const cookbook = {
    id: cookbookId,
    title: "Recipe Book",
    subtitle: "A growing collection of recipes worth making again—from celebration cakes to deeply chocolatey bakes.",
    language: "English",
  };
  let recipes = sampleRecipes.map((sample, i) => ({
    id: `r${i + 1}`,
    owner_id: userId,
    cookbook_id: cookbookId,
    title: sample.content.title,
    category: sample.content.category,
    position: i + 1,
    source_url: sample.source_url,
    source_platform: sample.source_platform,
    source_author: sample.source_author,
    cover_path: i === 0 ? `${userId}/r1.jpg` : null,
    content: sample.content,
    created_at: new Date().toISOString(),
  }));
  let imports = [];
  let cookedCount = 0;

  // The worker's progress steps, in seconds since the import was added.
  const STEPS = {
    video: [
      [1.5, "Downloading the video"],
      [4, "Watching the video"],
      [7, "Writing the recipe"],
      [10.5, "Adding it to your cookbook"],
    ],
    images: [
      [1.5, "Writing the recipe"],
      [6, "Adding it to your cookbook"],
    ],
  };
  const DONE_AFTER = { video: 12, images: 7.5 };

  function platformOf(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\.|^m\./, "");
      const names = {
        "youtube.com": "YouTube",
        "youtu.be": "YouTube",
        "instagram.com": "Instagram",
        "tiktok.com": "TikTok",
        "facebook.com": "Facebook",
        "pinterest.com": "Pinterest",
        "vimeo.com": "Vimeo",
      };
      return names[host] ?? host;
    } catch {
      return null;
    }
  }

  function finish(item) {
    const template = cookedRecipes[cookedCount++ % cookedRecipes.length];
    const id = `cooked-${cookedCount}`;
    const coverPath = item.kind === "images" ? item.image_paths[0] : null;
    recipes.push({
      id,
      owner_id: userId,
      cookbook_id: cookbookId,
      import_id: item.id,
      title: template.title,
      category: template.category,
      position: Math.max(0, ...recipes.map((r) => r.position)) + 1,
      source_url: item.kind === "video" ? item.source_url : null,
      source_platform: item.kind === "video" ? platformOf(item.source_url) : null,
      source_author: null,
      cover_path: coverPath,
      content: template,
      created_at: new Date().toISOString(),
    });
    item.status = "done";
    item.progress = null;
  }

  // Advances every import to where it would be by now.
  function tick() {
    const now = Date.now();
    for (const item of imports) {
      if (item.status === "done" || item.status === "failed") continue;
      const elapsed = (now - item._added) / 1000;
      if (elapsed >= DONE_AFTER[item.kind]) {
        finish(item);
        continue;
      }
      const step = STEPS[item.kind].filter(([at]) => elapsed >= at).pop();
      item.status = step ? "processing" : "queued";
      item.progress = step ? step[1] : null;
    }
  }

  function publicImport({ _added, ...item }) {
    return item;
  }

  function filterRows(rows, params) {
    let result = rows;
    for (const [key, value] of params) {
      if (["select", "order", "limit", "offset"].includes(key)) continue;
      const [op, ...rest] = value.split(".");
      const operand = rest.join(".");
      if (op === "eq") result = result.filter((row) => String(row[key]) === operand);
      if (op === "neq") result = result.filter((row) => String(row[key]) !== operand);
    }
    return result;
  }

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const empty = (status = 204) => new Response(null, { status });

  async function handle(url, init) {
    const method = (init.method ?? "GET").toUpperCase();
    const path = url.pathname;
    const params = url.searchParams;
    const readBody = () => (typeof init.body === "string" ? JSON.parse(init.body) : {});
    tick();

    // Auth
    if (path === "/auth/v1/otp") return json({});
    if (path === "/auth/v1/verify" || path === "/auth/v1/token" || path === "/auth/v1/signup") return json(session());
    if (path === "/auth/v1/user") return json(user);
    if (path === "/auth/v1/logout") return empty();

    // Database
    if (path === "/rest/v1/cookbooks") {
      const single = (new Headers(init.headers).get("accept") ?? "").includes("vnd.pgrst.object");
      return json(single ? cookbook : [cookbook]);
    }
    if (path === "/rest/v1/recipes") {
      if (method === "DELETE") {
        const gone = filterRows(recipes, params).map((r) => r.id);
        recipes = recipes.filter((r) => !gone.includes(r.id));
        return empty();
      }
      return json(filterRows(recipes, params).sort((a, b) => a.position - b.position));
    }
    if (path === "/rest/v1/imports") {
      if (method === "POST") {
        const rows = [].concat(readBody());
        for (const row of rows) {
          imports.unshift({
            id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            owner_id: userId,
            cookbook_id: row.cookbook_id,
            kind: row.kind,
            source_url: row.source_url ?? null,
            image_paths: row.image_paths ?? [],
            status: "queued",
            progress: null,
            error: null,
            created_at: new Date().toISOString(),
            _added: Date.now(),
          });
        }
        return empty(201);
      }
      if (method === "DELETE") {
        const gone = filterRows(imports, params).map((i) => i.id);
        imports = imports.filter((i) => !gone.includes(i.id));
        return empty();
      }
      return json(filterRows(imports, params).map(publicImport));
    }

    // Storage
    const signMany = path.match(/^\/storage\/v1\/object\/sign\/([^/]+)$/);
    if (signMany && method === "POST") {
      const { paths = [] } = readBody();
      return json(paths.map((p) => ({ path: p, signedURL: `/object/sign/${signMany[1]}/${p}?token=demo`, error: null })));
    }
    const upload = path.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (upload && (method === "POST" || method === "PUT")) {
      const objectPath = decodeURIComponent(upload[2]);
      const body = init.body instanceof FormData ? init.body.get("") ?? [...init.body.values()][0] : init.body;
      blobs.set(objectPath, URL.createObjectURL(new Blob([body], { type: "image/jpeg" })));
      return json({ Key: `${upload[1]}/${objectPath}`, Id: objectPath });
    }

    return json({ message: `The preview has no answer for ${method} ${path}` }, 404);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const href = request ? request.url : String(input);
    if (!href.startsWith(HOST)) return realFetch(input, init);
    if (request) {
      init = {
        method: request.method,
        headers: request.headers,
        body: request.method === "GET" ? undefined : await request.clone().text(),
        ...init,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 120)); // feel like a network
    return handle(new URL(href), init);
  };

  // Images the app shows come from storage URLs; serve them from memory.
  function imageFor(src) {
    if (typeof src !== "string" || !src.startsWith(`${HOST}/storage/v1/object/sign/`)) return src;
    const objectPath = decodeURIComponent(new URL(src).pathname.replace(/^\/storage\/v1\/object\/sign\/[^/]+\//, ""));
    return blobs.get(objectPath) ?? src;
  }
  const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    ...srcDescriptor,
    set(value) {
      srcDescriptor.set.call(this, imageFor(value));
    },
  });
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    return setAttribute.call(this, name, name === "src" && this instanceof HTMLImageElement ? imageFor(value) : value);
  };

  // No live updates in the preview; the app checks back on its own while cooking.
  const RealWebSocket = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    if (String(url).includes("demo.supabase.co")) {
      const socket = new EventTarget();
      Object.assign(socket, { readyState: 0, url: String(url), send() {}, close() {} });
      return socket;
    }
    return new RealWebSocket(url, protocols);
  };
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
})();
