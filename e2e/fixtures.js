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
  // "HELLO WORLD" in a 5x7 bitmap font, for OCR on images
  const G = {
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  };
  const word = "HELLO WORLD", S = 6, M = 24;
  fs.writeFileSync(out("text.png"), png(word.length * 6 * S + 2 * M, 7 * S + 2 * M, (x, y) => {
    const cx = Math.floor((x - M) / S), cy = Math.floor((y - M) / S);
    const g = G[word[Math.floor(cx / 6)]];
    return x >= M && y >= M && cy < 7 && g && cx % 6 < 5 && g[cy][cx % 6] === "1" ? [0, 0, 0] : [255, 255, 255];
  }));
  // image-only PDF (no text layer), for OCR
  {
    const doc = await PDFDocument.create();
    const img = await doc.embedPng(fs.readFileSync(out("text.png")));
    const page = doc.addPage([400, 200]);
    page.drawImage(img, { x: 20, y: 60, width: img.width * 0.6, height: img.height * 0.6 });
    fs.writeFileSync(out("scan.pdf"), await doc.save());
  }
  fs.writeFileSync(out("sheet.csv"), "Nom;Montant\nAlice;12,5\nBob;7\n");
  // minimal ODP (zip with stored entries, mimetype first)
  {
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
    const MIME = "application/vnd.oasis.opendocument.presentation";
    const entries = [
      ["mimetype", MIME],
      ["META-INF/manifest.xml", `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="${MIME}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>`],
      ["content.xml", `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2"><office:body><office:presentation><draw:page draw:name="page1"><draw:frame svg:x="2cm" svg:y="2cm" svg:width="20cm" svg:height="3cm"><draw:text-box><text:p>Hello from odp</text:p></draw:text-box></draw:frame></draw:page></office:presentation></office:body></office:document-content>`],
    ];
    const parts = [], central = [];
    let offset = 0;
    for (const [name, text] of entries) {
      const n = Buffer.from(name), d = Buffer.from(text), c = crc(d);
      const h = Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4);
      h.writeUInt32LE(c, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26);
      const e = Buffer.alloc(46);
      e.writeUInt32LE(0x02014b50, 0); e.writeUInt16LE(20, 4); e.writeUInt16LE(20, 6);
      e.writeUInt32LE(c, 16); e.writeUInt32LE(d.length, 20); e.writeUInt32LE(d.length, 24); e.writeUInt16LE(n.length, 28);
      e.writeUInt32LE(offset, 42);
      parts.push(h, n, d); central.push(e, n);
      offset += 30 + n.length + d.length;
    }
    const cd = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    fs.writeFileSync(out("slides.odp"), Buffer.concat([...parts, cd, end]));
  }
  fs.writeFileSync(out("doc.txt"), "Hello from txt\nline2\n");
})();
