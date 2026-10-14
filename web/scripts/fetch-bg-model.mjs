// Downloads the background-removal model + ONNX runtime from IMG.LY's CDN at build time and serves
// them from /bg-model/, so visitors never contact a third party. Every chunk is named by its
// sha256 and verified; the manifest itself is pinned by hash.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSION = "1.6.0"; // must match @imgly/background-removal in package.json
const MANIFEST_SHA256 = "4e2a359d0436f1e55cb0e4e29a1c943f5d86d639ba4f4b5ea874a699b1f742d3";
const WANTED = [
  "/models/isnet_fp16", // default "medium" model
  "/onnxruntime-web/ort-wasm-simd-threaded.wasm", // CPU backend (default device)
  "/onnxruntime-web/ort-wasm-simd-threaded.mjs",
];
const BASE = `https://staticimgly.com/@imgly/background-removal-data/${VERSION}/dist/`;
const OUT = join("public", "bg-model");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

mkdirSync(OUT, { recursive: true });
const manifestBuf = await get(BASE + "resources.json");
if (sha256(manifestBuf) !== MANIFEST_SHA256) throw new Error("resources.json hash mismatch");
const manifest = JSON.parse(manifestBuf.toString());

const kept = {};
let bytes = 0;
for (const key of WANTED) {
  const entry = manifest[key];
  if (!entry) throw new Error(`${key} missing from manifest`);
  for (const chunk of entry.chunks) {
    const file = join(OUT, chunk.name);
    if (existsSync(file) && sha256(readFileSync(file)) === chunk.hash) continue;
    const data = await get(BASE + chunk.name);
    if (sha256(data) !== chunk.hash) throw new Error(`hash mismatch for ${key} (${chunk.name})`);
    writeFileSync(file, data);
    bytes += data.length;
  }
  kept[key] = entry;
}
writeFileSync(join(OUT, "resources.json"), JSON.stringify(kept));
console.log(`bg-model: ${WANTED.length} resources ready in ${OUT} (${(bytes / 1e6).toFixed(1)} MB downloaded)`);
