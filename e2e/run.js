const { chromium } = require("playwright");
const path = require("path");
const BASE = process.env.BASE || "http://localhost:3000/fr";
const F = (n) => path.join(__dirname, "fixtures", n);
const OUT = path.join(__dirname, "out");
require("fs").mkdirSync(OUT, { recursive: true });

const cases = [
  ["merge-pdf", ["a.pdf", "b.pdf"]],
  ["split-pdf", ["a.pdf"], async (p) => { await p.getByRole("button", { name: "Chaque page" }).click(); }],
  ["remove-pages", ["a.pdf"], async (p) => p.fill("#opt-pages", "2")],
  ["extract-pages", ["a.pdf"], async (p) => p.fill("#opt-pages", "1,3")],
  ["organize-pdf", ["a.pdf", "b.pdf"], async (p) => p.waitForTimeout(1500)],
  ["rotate-pdf", ["a.pdf"]],
  ["page-numbers", ["a.pdf"]],
  ["watermark-pdf", ["a.pdf"]],
  ["pdf-to-jpg", ["a.pdf"]],
  ["jpg-to-pdf", ["img.png", "photo.png"]],
  ["resize-image", ["photo.png"]],
  ["crop-image", ["photo.png"], async (p) => p.waitForTimeout(500)],
  ["compress-image", ["photo.png"]],
  ["convert-image", ["photo.png"]],
  ["rotate-image", ["photo.png"]],
  ["watermark-image", ["photo.png"]],
  ["compress-pdf", ["a.pdf"]],
  ["word-to-pdf", ["doc.txt"]],
  ["pdf-to-word", ["a.pdf"]],
  ["protect-pdf", ["a.pdf"], async (p) => p.fill("#opt-password", "x")],
  ["compare-pdf", ["a.pdf", "b.pdf"]],
  ["upscale-image", ["photo.png"]],
  ["html-to-pdf", [], async (p) => p.fill("#opt-url", "https://example.com")],
  ["sign-pdf", ["a.pdf"], async (p) => {
    const pad = p.locator("canvas").first();
    await pad.waitFor();
    const b = await pad.boundingBox();
    await p.mouse.move(b.x + 30, b.y + 60); await p.mouse.down();
    for (let i = 0; i < 20; i++) await p.mouse.move(b.x + 30 + i * 12, b.y + 60 + Math.sin(i) * 25);
    await p.mouse.up();
    await p.waitForSelector("[data-overlay]");
    const o = await p.locator("[data-overlay]").boundingBox();
    await p.mouse.click(o.x + o.width * 0.6, o.y + o.height * 0.8);
  }],
  ["edit-pdf", ["a.pdf"], async (p) => {
    await p.waitForSelector("[data-overlay]");
    const o = await p.locator("[data-overlay]").boundingBox();
    await p.mouse.click(o.x + o.width * 0.2, o.y + o.height * 0.3);
    await p.locator("textarea").fill("Hello édition");
    await p.getByRole("button", { name: "Surligner" }).click();
    await p.mouse.move(o.x + 60, o.y + 50); await p.mouse.down(); await p.mouse.move(o.x + 300, o.y + 80); await p.mouse.up();
  }],
  ["remove-bg", ["photo.png"]],
];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 900 } });
  const only = process.argv[2];
  for (const [id, files, setup] of cases) {
    if (only && !only.split(",").includes(id)) continue;
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    const t0 = Date.now();
    try {
      await p.goto(`${BASE}/${id}`);
      if (files.length) await p.setInputFiles('input[type="file"]', files.map(F));
      if (setup) await setup(p);
      const runBtn = p.locator("aside button").last();
      await runBtn.waitFor();
      const dl = p.waitForEvent("download", { timeout: 120000 }).catch(() => null);
      await runBtn.click();
      const done = p.getByText("Terminé !");
      const err = p.locator("aside .bg-red-50");
      await Promise.race([done.waitFor({ timeout: 120000 }), err.waitFor({ timeout: 120000 })]);
      if (await err.isVisible()) throw new Error(await err.innerText());
      let d = await Promise.race([dl, p.waitForTimeout(1500).then(() => null)]);
      if (!d) {
        const zipDl = p.waitForEvent("download");
        await p.getByText("Tout télécharger (ZIP)").click();
        d = await zipDl;
      }
      const file = path.join(OUT, `${id}__${d.suggestedFilename()}`);
      await d.saveAs(file);
      const size = require("fs").statSync(file).size;
      console.log(`OK   ${id.padEnd(18)} ${d.suggestedFilename()} ${size}B ${Date.now() - t0}ms ${errs.length ? "PAGEERR " + errs.join("|") : ""}`);
      if (["sign-pdf", "edit-pdf", "crop-image", "organize-pdf"].includes(id)) {
        await p.getByText("Recommencer").click();
      }
    } catch (e) {
      await p.screenshot({ path: path.join(OUT, `${id}_fail.png`) });
      process.exitCode = 1;
      console.log(`FAIL ${id.padEnd(18)} ${String(e.message).split("\n")[0]} ${errs.join("|")}`);
    }
    await p.close();
  }
  await browser.close();
})();
