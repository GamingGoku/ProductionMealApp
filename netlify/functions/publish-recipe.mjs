// netlify/functions/publish-recipe.mjs
// Admin-only: upsert a recipe into recipe-library.json in your GitHub repo.

function getEnv(name) {
  // Netlify Functions support Netlify.env.get; fall back to process.env for safety.
  return (globalThis.Netlify?.env?.get?.(name)) ?? process.env[name];
}

function jsonResponse(obj, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function parseNetlifyIdentityUser(context) {
  // Prefer direct decoded user if present
  const directUser = context?.clientContext?.user;
  if (directUser) return directUser;

  // Otherwise decode the base64 payload (per Netlify Identity docs)
  const raw = context?.clientContext?.custom?.netlify;
  if (!raw) return null;

  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    return parsed?.user ?? null;
  } catch {
    return null;
  }
}

function isAdmin(user) {
  const roles =
    user?.app_metadata?.roles ??
    user?.app_metadata?.authorization?.roles ??
    [];
  return Array.isArray(roles) && roles.includes("admin");
}

function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function ghRequest(path, { method = "GET", body } = {}) {
  const token = getEnv("GITHUB_TOKEN");
  const owner = getEnv("GITHUB_OWNER");
  const repo = getEnv("GITHUB_REPO");

  if (!token || !owner || !repo) {
    throw new Error("Missing GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO env vars.");
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!res.ok) {
    const msg = data?.message || text || `GitHub API error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function loadLibrary() {
  const branch = getEnv("GITHUB_BRANCH") || "main";
  const path = getEnv("GITHUB_PATH") || "recipe-library.json";

  // GET contents
  const data = await ghRequest(`/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`);

  const contentB64 = data?.content;
  const sha = data?.sha;

  if (!contentB64 || !sha) {
    throw new Error("recipe-library.json missing content/sha from GitHub response.");
  }

  const jsonText = Buffer.from(contentB64.replace(/\n/g, ""), "base64").toString("utf-8");
  const lib = JSON.parse(jsonText);

  if (!lib || typeof lib !== "object" || !Array.isArray(lib.recipes)) {
    return { sha, lib: { version: 1, recipes: [] } };
  }

  return { sha, lib };
}

async function saveLibrary({ lib, sha }) {
  const branch = getEnv("GITHUB_BRANCH") || "main";
  const path = getEnv("GITHUB_PATH") || "recipe-library.json";

  const content = Buffer.from(JSON.stringify(lib, null, 2), "utf-8").toString("base64");

  // PUT contents
  return ghRequest(`/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: {
      message: `Update recipe library (${new Date().toISOString()})`,
      content,
      sha,
      branch,
    },
  });
}

export default async (req, context) => {
  // Auth
  const user = parseNetlifyIdentityUser(context);
  if (!user) return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return jsonResponse({ error: "Forbidden" }, { status: 403 });

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = String(body?.name || "").trim();
  const ingredients = Array.isArray(body?.ingredients) ? body.ingredients : [];
  const method = Array.isArray(body?.method) ? body.method : [];
  const sourceUrl = body?.sourceUrl ? String(body.sourceUrl) : "";

  if (!name) return jsonResponse({ error: "Missing recipe name" }, { status: 400 });
  if (!ingredients.length) return jsonResponse({ error: "Missing ingredients[]" }, { status: 400 });

  const id = String(body?.id || slugify(name) || crypto.randomUUID());
  const now = new Date().toISOString();

  const { sha, lib } = await loadLibrary();

  const existingIdx = lib.recipes.findIndex(r => r?.id === id || (r?.name && r.name.trim().toLowerCase() === name.toLowerCase()));
  const record = {
    id,
    name,
    ingredients,
    method,
    sourceUrl,
    updatedAt: now,
    createdAt: existingIdx >= 0 ? (lib.recipes[existingIdx]?.createdAt || now) : now,
    updatedBy: user?.email || user?.sub || "admin",
  };

  if (existingIdx >= 0) lib.recipes[existingIdx] = record;
  else lib.recipes.push(record);

  lib.version = lib.version || 1;

  await saveLibrary({ lib, sha });

  return jsonResponse({ ok: true, recipe: record, count: lib.recipes.length });
};

