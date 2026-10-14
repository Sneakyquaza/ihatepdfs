// Generates the input files used by run.js into ./fixtures (no binaries committed).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { PDFDocument, StandardFonts } = require("pdf-lib");

const dir = path.join(__dirname, "fixtures");
fs.mkdirSync(dir, { recursive: true });
const out = (n) => path.join(dir, n);

function png(w, h, pixel) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) Buffer.from(pixel(x, y)).copy(row, 1 + x * 3);
    rows.push(row);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

(async () => {
  for (const [name, text] of [
    ["a.pdf", "Bonjour le monde. Ceci est la version un du contrat."],
    ["b.pdf", "Bonjour le monde. Ceci est la version deux du contrat signe."],
  ]) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 3; i++) doc.addPage().drawText(`${text} Page ${i + 1}`, { x: 72, y: 760 - i * 20, size: 14, font });
    fs.writeFileSync(out(name), await doc.save());
  }
  // subject (orange ellipse) on a gradient background, for remove-bg and image tools
  fs.writeFileSync(out("photo.png"), png(320, 240, (x, y) =>
    (x - 160) ** 2 / 80 ** 2 + (y - 130) ** 2 / 90 ** 2 < 1 ? [230, 120, 40] : [40 + Math.floor(y / 3), 140, 200]));
  fs.writeFileSync(out("img.png"), png(200, 150, () => [200, 30, 30]));
  fs.writeFileSync(out("doc.txt"), "Hello from txt\nline2\n");
})();
