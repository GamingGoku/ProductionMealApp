// netlify/functions/export-recipes.mjs
// Admin-only: exports the entire recipe library as a downloadable JSON.

function getEnv(name) {
  return (globalThis.Netlify?.env?.get?.(name)) ?? process.env[name];
}

function parseNetlifyIdentityUser(context) {
  const directUser = context?.clientContext?.user;
  if (directUser) return directUser;

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

async function ghRequest(path) {
  const token = getEnv("GITHUB_TOKEN");
  const owner = getEnv("GITHUB_OWNER");
  const repo = getEnv("GITHUB_REPO");

  if (!token || !owner || !repo) {
    throw new Error("Missing GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO env vars.");
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    }
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!res.ok) {
    const msg = data?.message || text || `GitHub API error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

export default async (req, context) => {
  const user = parseNetlifyIdentityUser(context);
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  if (!isAdmin(user)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const branch = getEnv("GITHUB_BRANCH") || "main";
  const path = getEnv("GITHUB_PATH") || "recipe-library.json";

  const data = await ghRequest(`/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`);

  const contentB64 = data?.content;
  if (!contentB64) {
    return new Response(JSON.stringify({ error: "Library file missing content" }), { status: 500 });
  }

  const jsonText = Buffer.from(contentB64.replace(/\n/g, ""), "base64").toString("utf-8");

  return new Response(jsonText, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="recipe-library-export.json"`,
      "Cache-Control": "no-store",
    },
  });
};
