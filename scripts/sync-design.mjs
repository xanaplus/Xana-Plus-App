#!/usr/bin/env node
/**
 * Refresh design/specs/*.json and design/reference/*.png from the Figma file
 * using the Figma REST API (a separate quota from the Figma MCP server).
 *
 *   node scripts/sync-design.mjs                 # specs + PNGs for every frame
 *   node scripts/sync-design.mjs --no-images     # specs only (fast)
 *   node scripts/sync-design.mjs --only=05a      # frames whose slug starts with 05a
 *
 * Requires FIGMA_TOKEN in the environment or in .env (see .env.example).
 */
import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_DIR = join(ROOT, "design", "specs");
const REF_DIR = join(ROOT, "design", "reference");

const MAX_DEPTH = 6; // deeper nodes collapse to { childCount }
const OPAQUE_GROUPS = new Set(["GROUP", "BOOLEAN_OPERATION", "VECTOR"]);

// ---------------------------------------------------------------- env / args
function loadEnv() {
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']/, "").replace(/["']$/, "");
    }
  }
}
loadEnv();

// Token resolution, in order of preference:
//   1. FIGMA_TOKEN_FILE — path to a file holding the token (keeps the secret
//      out of the repo entirely; nothing is copied or echoed)
//   2. FIGMA_TOKEN — the token itself
function resolveToken() {
  const path = process.env.FIGMA_TOKEN_FILE;
  if (path) {
    if (!existsSync(path)) {
      console.error(`\nFIGMA_TOKEN_FILE points at a file that does not exist:\n  ${path}\n`);
      process.exit(1);
    }
    const t = readFileSync(path, "utf8").trim();
    if (!t) {
      console.error(`\nFIGMA_TOKEN_FILE is empty:\n  ${path}\n`);
      process.exit(1);
    }
    return t;
  }
  return process.env.FIGMA_TOKEN;
}

const TOKEN = resolveToken();
const FILE_KEY = process.env.FIGMA_FILE_KEY || "G4iVN6s7cWFkkl2oCXuhb8";
const args = process.argv.slice(2);
const noImages = args.includes("--no-images");
const imagesOnly = args.includes("--images-only");
const onlyRaw = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1] || null;
const onlyList = onlyRaw ? onlyRaw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : null;

// Every network call gets a deadline. Without one, a stalled connection to the
// rendered-image CDN hangs the whole run with no output and no error.
const REQUEST_TIMEOUT_MS = 60000;

if (!TOKEN) {
  console.error(
    "\nNo Figma token found.\n\n" +
      "Set one of these in .env (see .env.example):\n" +
      "  FIGMA_TOKEN_FILE=/path/to/token.txt   (preferred - keeps the secret out of the repo)\n" +
      "  FIGMA_TOKEN=figd_...\n\n" +
      "Create a token at: Figma -> Settings -> Security -> Personal access tokens\n" +
      "Scope required: 'File content: read'\n"
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Figma's REST limits are cost-based: a full /files fetch is far more expensive
// than /images, so retry 429s with backoff rather than failing the whole run.
async function api(path, { retries = 5 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`https://api.figma.com/v1${path}`, {
        headers: { "X-Figma-Token": TOKEN },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      if (attempt >= retries) throw new Error(`Figma API request failed on ${path}: ${e.message}`);
      console.log(`  ...request error (${e.message}), retrying`);
      await sleep(Math.min(30000, 3000 * 2 ** attempt));
      continue;
    }
    if (res.ok) return res.json();

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new Error(`Figma API ${res.status} ${res.statusText} on ${path}\n${await res.text()}`);
    }
    // Figma can return a Retry-After measured in days when a token is in a hard
    // cooldown. Sleeping that long is never right for a CLI: cap the wait, and
    // if the cooldown is longer than the cap, fail loudly with the real number.
    const MAX_WAIT_MS = 120000;
    const headerWait = Number(res.headers.get("retry-after"));
    const suggested = Number.isFinite(headerWait) && headerWait > 0 ? headerWait * 1000 : Math.min(MAX_WAIT_MS, 5000 * 2 ** attempt);

    if (suggested > MAX_WAIT_MS) {
      const hrs = (suggested / 3600000).toFixed(1);
      throw new Error(
        `Figma rate limit: token is in cooldown for about ${hrs}h (Retry-After: ${headerWait}s).\n` +
          `Nothing further will succeed until it clears. Re-run this command later.`
      );
    }
    console.log(`  ...${res.status} from Figma, retrying in ${Math.round(suggested / 1000)}s (attempt ${attempt + 1}/${retries})`);
    await sleep(suggested);
  }
}

// ---------------------------------------------------------------- formatting
function slugify(s) {
  return s
    .normalize("NFKD")
    .replace(/[·—–]/g, " ")
    .replace(/[^A-Za-z0-9\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "");
}

function hex(c) {
  if (!c) return null;
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${to(c.r)}${to(c.g)}${to(c.b)}`;
}

function paint(p) {
  if (!p || p.visible === false) return null;
  if (p.type === "SOLID") {
    const a = (p.opacity ?? 1) * (p.color?.a ?? 1);
    return hex(p.color) + (a < 0.999 ? `@${Math.round(a * 100)}%` : "");
  }
  if (p.type === "IMAGE") return "image";
  if (p.type && p.type.startsWith("GRADIENT")) {
    const stops = (p.gradientStops || []).map((s) => hex(s.color)).join(",");
    return `${p.type.replace("GRADIENT_", "").toLowerCase()}(${stops})`;
  }
  return p.type ? p.type.toLowerCase() : null;
}

function paints(arr) {
  const out = (arr || []).map(paint).filter(Boolean);
  return out.length ? out.join("|") : null;
}

function effect(e) {
  if (!e || e.visible === false) return null;
  const a = e.color?.a ?? 1;
  if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
    const ox = e.offset?.x ?? 0;
    const oy = e.offset?.y ?? 0;
    return `${e.type} ${hex(e.color)}@${Math.round(a * 100)}% ${ox}/${oy} blur${Math.round(e.radius ?? 0)}`;
  }
  return `${e.type} ${Math.round(e.radius ?? 0)}`;
}

function layoutStr(n) {
  if (!n.layoutMode || n.layoutMode === "NONE") return null;
  const pad = [n.paddingTop ?? 0, n.paddingRight ?? 0, n.paddingBottom ?? 0, n.paddingLeft ?? 0];
  let s = `${n.layoutMode} pad=${pad.join(",")}`;
  if (n.primaryAxisAlignItems) s += ` main=${n.primaryAxisAlignItems}`;
  if (n.counterAxisAlignItems) s += ` cross=${n.counterAxisAlignItems}`;
  if (n.itemSpacing) s += ` gap=${n.itemSpacing}`;
  return s;
}

function styleStr(st) {
  if (!st) return null;
  return `${st.fontFamily ?? "?"} ${st.fontWeight ?? "?"} ${Math.round(st.fontSize ?? 0)}px ls=${st.letterSpacing ?? 0}`;
}

function radius(n) {
  if (n.rectangleCornerRadii) return n.rectangleCornerRadii.join(",");
  return n.cornerRadius ?? null;
}

// ---------------------------------------------------------------- tree build
function buildNode(n, origin, depth) {
  const b = n.absoluteBoundingBox;
  const node = {
    name: n.name,
    type: n.type,
    box: b
      ? {
          x: Math.round(b.x - origin.x),
          y: Math.round(b.y - origin.y),
          w: Math.round(b.width),
          h: Math.round(b.height),
        }
      : null,
  };

  const l = layoutStr(n);
  if (l) node.layout = l;
  const f = paints(n.fills);
  if (f) node.fill = f;
  const s = paints(n.strokes);
  if (s) node.stroke = s;
  const r = radius(n);
  if (r !== null && r !== 0) node.radius = r;

  const fx = (n.effects || []).map(effect).filter(Boolean);
  if (fx.length) {
    const shadow = fx.filter((x) => x.includes("SHADOW"));
    const blur = fx.filter((x) => x.includes("BLUR"));
    if (shadow.length) node.shadow = shadow.join(" + ");
    if (blur.length) node.blur = blur.join(" + ");
  }

  if (n.type === "TEXT") {
    node.text = n.characters;
    const st = styleStr(n.style);
    if (st) node.style = st;
  }

  const kids = (n.children || []).filter((k) => k.visible !== false);
  if (kids.length) {
    if (depth >= MAX_DEPTH || OPAQUE_GROUPS.has(n.type)) node.childCount = kids.length;
    else node.children = kids.map((k) => buildNode(k, origin, depth + 1));
  }
  return node;
}

function collectTexts(n, origin, out) {
  out = out || [];
  if (n.visible === false) return out;
  if (n.type === "TEXT" && n.characters) {
    const b = n.absoluteBoundingBox;
    out.push({
      text: n.characters,
      style: styleStr(n.style),
      box: b ? { x: Math.round(b.x - origin.x), y: Math.round(b.y - origin.y) } : null,
    });
  }
  for (const k of n.children || []) collectTexts(k, origin, out);
  return out;
}

// ---------------------------------------------------------------- main
mkdirSync(SPEC_DIR, { recursive: true });
mkdirSync(REF_DIR, { recursive: true });

// --images-only skips the expensive /files fetch entirely and renders straight
// from the ids already recorded in _index.json.
let frames = [];
let index = [];

if (imagesOnly) {
  const idxPath = join(SPEC_DIR, "_index.json");
  if (!existsSync(idxPath)) {
    console.error("\n--images-only needs design/specs/_index.json. Run a spec sync first.\n");
    process.exit(1);
  }
  index = JSON.parse(readFileSync(idxPath, "utf8"));
  frames = index.map((e) => ({ id: e.id, name: e.name }));
  if (onlyList) frames = frames.filter((f) => onlyList.some((o) => slugify(f.name).startsWith(o)));
  console.log(`Rendering ${frames.length} frame(s) from _index.json (no file fetch)`);
} else {
  console.log(`Fetching file ${FILE_KEY} ...`);
  const file = await api(`/files/${FILE_KEY}`);
  const page = file.document.children.find((c) => c.type === "CANVAS");
  if (!page) throw new Error("No page found in document");

  frames = (page.children || []).filter((c) => c.absoluteBoundingBox);
  frames.sort((a, b) => a.name.localeCompare(b.name));
  if (onlyList) frames = frames.filter((f) => onlyList.some((o) => slugify(f.name).startsWith(o)));
  console.log(`Found ${frames.length} top-level frame(s) on "${page.name}"`);
}

for (const f of imagesOnly ? [] : frames) {
  const origin = { x: f.absoluteBoundingBox.x, y: f.absoluteBoundingBox.y };
  const slug = slugify(f.name);
  const kids = (f.children || []).filter((k) => k.visible !== false);
  const spec = {
    id: f.id,
    name: f.name,
    slug,
    size: {
      w: Math.round(f.absoluteBoundingBox.width),
      h: Math.round(f.absoluteBoundingBox.height),
    },
    bg: paints(f.fills),
    tree: kids.map((k) => buildNode(k, origin, 1)),
    texts: collectTexts(f, origin),
  };
  writeFileSync(join(SPEC_DIR, `${slug}.json`), JSON.stringify(spec, null, 1) + "\n");
  index.push({
    id: f.id,
    name: f.name,
    slug,
    w: spec.size.w,
    h: spec.size.h,
    sections: spec.tree.length,
  });
  console.log(`  spec  ${slug}`);
}
if (!imagesOnly) {
  writeFileSync(join(SPEC_DIR, "_index.json"), JSON.stringify(index, null, 1) + "\n");
}

if (!noImages) {
  const CHUNK = 8;
  for (let i = 0; i < frames.length; i += CHUNK) {
    const batch = frames.slice(i, i + CHUNK);
    const ids = batch.map((f) => f.id).join(",");
    const out = await api(`/images/${FILE_KEY}?ids=${encodeURIComponent(ids)}&format=png&scale=1`);
    if (out.err) throw new Error(`Image render failed: ${out.err}`);
    for (const f of batch) {
      const url = out.images[f.id];
      if (!url) {
        console.warn(`  !     no render for ${f.name}`);
        continue;
      }
      let buf = null;
      for (let attempt = 0; attempt < 3 && !buf; attempt++) {
        try {
          const dl = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
          if (!dl.ok) throw new Error(`HTTP ${dl.status}`);
          buf = Buffer.from(await dl.arrayBuffer());
        } catch (e) {
          console.log(`  ...download failed for ${f.name} (${e.message})${attempt < 2 ? ", retrying" : ""}`);
          if (attempt < 2) await sleep(3000 * (attempt + 1));
        }
      }
      if (!buf) {
        console.warn(`  !     gave up on ${f.name}`);
        continue;
      }
      writeFileSync(join(REF_DIR, `${slugify(f.name)}.png`), buf);
      console.log(`  png   ${slugify(f.name)}  ${(buf.length / 1024).toFixed(0)}kb`);
    }
  }
}

console.log(`\nDone. ${index.length} frames -> design/specs/${noImages ? "" : " + design/reference/"}`);
