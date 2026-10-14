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
  ["pdf-to-powerpoint", ["a.pdf"]],
  ["pdf-to-excel", ["a.pdf"]],
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
  ["n-up-pdf", ["a.pdf"]],
  ["grayscale-pdf", ["a.pdf"]],
  ["flatten-pdf", ["a.pdf"]],
  ["pdf-to-text", ["a.pdf"]],
  ["crop-pdf", ["a.pdf"], async (p) => p.getByRole("button", { name: "1:1" }).click()],
  ["edit-metadata", ["a.pdf"], async (p) => p.getByLabel("Tout effacer").check()],
  ["image-to-text", ["photo.png"]],
  ["redact-pdf", ["a.pdf"], async (p) => {
    await p.waitForSelector("[data-overlay]");
    const o = await p.locator("[data-overlay]").boundingBox();
    await p.mouse.move(o.x + o.width * 0.1, o.y + o.height * 0.05); await p.mouse.down();
    await p.mouse.move(o.x + o.width * 0.6, o.y + o.height * 0.12); await p.mouse.up();
    await p.fill("#opt-terms", "contrat");
  }],
  ["blur-image", ["photo.png"], async (p) => {
    await p.waitForSelector("[data-overlay]");
    await p.waitForTimeout(300);
    const o = await p.locator("[data-overlay]").boundingBox();
    await p.mouse.move(o.x + o.width * 0.3, o.y + o.height * 0.3); await p.mouse.down();
    await p.mouse.move(o.x + o.width * 0.7, o.y + o.height * 0.7); await p.mouse.up();
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
      if (["sign-pdf", "edit-pdf", "crop-image", "organize-pdf", "crop-pdf", "redact-pdf", "blur-image"].includes(id)) {
        await p.getByText("Recommencer").click();
      }
    } catch (e) {
      await p.screenshot({ path: path.join(OUT, `${id}_fail.png`) });
      process.exitCode = 1;
      console.log(`FAIL ${id.padEnd(18)} ${String(e.message).split("\n")[0]} ${errs.join("|")}`);
    }
    await p.close();
  }
  if (!only) {
    // password-protected PDF in a browser-side tool must be refused with a pointer to the unlock tool
    const fs = require("fs");
    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(F("a.pdf"))]), "a.pdf");
    form.append("password", "secret");
    const enc = await fetch(new URL("/api/protect-pdf", BASE), { method: "POST", body: form });
    fs.writeFileSync(F("locked.pdf"), Buffer.from(await enc.arrayBuffer()));
    const pe = await ctx.newPage();
    await pe.goto(`${BASE}/rotate-pdf`);
    await pe.setInputFiles('input[type="file"]', F("locked.pdf"));
    await pe.locator("aside button").last().click();
    const encOk = await pe.getByRole("link", { name: /Déverrouiller le PDF/ }).isVisible({ timeout: 10000 }).catch(() => false)
      || await pe.getByRole("link", { name: /Déverrouiller le PDF/ }).waitFor({ timeout: 10000 }).then(() => true, () => false);
    console.log(`${encOk ? "OK  " : "FAIL"} encrypted pdf      unlock link shown=${encOk}`);
    if (!encOk) process.exitCode = 1;
    // translated 404 and legal pages
    const r404 = await pe.goto(`${BASE}/n-existe-pas/vraiment`);
    const nfOk = r404.status() === 404 && await pe.getByRole("heading", { name: "Page introuvable" }).isVisible();
    await pe.goto(`${BASE}/legal`);
    const legalOk = await pe.getByText("Abou-Bakr Ghenaïm").first().isVisible();
    await pe.goto(`${BASE}/privacy`);
    const privOk = await pe.getByRole("heading", { name: "Vos fichiers" }).isVisible();
    console.log(`${nfOk && legalOk && privOk ? "OK  " : "FAIL"} pages              404=${nfOk} legal=${legalOk} privacy=${privOk}`);
    if (!(nfOk && legalOk && privOk)) process.exitCode = 1;
    await pe.close();

    // reaching remove-bg from the home grid must work too (its CSP differs, see next.config.ts)
    const pn = await ctx.newPage();
    const origin = new URL(BASE).origin;
    const external = [];
    pn.on("request", (r) => {
      const u = r.url();
      if (!u.startsWith(origin) && !u.startsWith("blob:") && !u.startsWith("data:")) external.push(u);
    });
    await pn.goto(BASE);
    await pn.getByRole("link", { name: /Supprimer l'arrière-plan/ }).first().click();
    await pn.waitForURL(/remove-bg/);
    await pn.setInputFiles('input[type="file"]', F("photo.png"));
    const dlNav = pn.waitForEvent("download", { timeout: 120000 }).then(() => true, () => false);
    await pn.locator("aside button").last().click();
    const navOk = await dlNav;
    console.log(`${navOk ? "OK  " : "FAIL"} remove-bg via home  downloaded=${navOk}`);
    console.log(`${external.length ? "FAIL" : "OK  "} third-party reqs   ${external.length ? external.slice(0, 3).join(" ") : "none"}`);
    if (!navOk || external.length) process.exitCode = 1;
    await pn.close();

    const check = (ok, name, info) => {
      console.log(`${ok ? "OK  " : "FAIL"} ${name.padEnd(18)} ${info}`);
      if (!ok) process.exitCode = 1;
    };

    // chaining: merge result handed to "Compress PDF" without re-uploading
    const pc = await ctx.newPage();
    await pc.goto(`${BASE}/merge-pdf`);
    await pc.setInputFiles('input[type="file"]', [F("a.pdf"), F("b.pdf")]);
    const dl1 = pc.waitForEvent("download");
    await pc.locator("aside button").last().click();
    await dl1;
    await pc.getByRole("button", { name: /Compresser PDF/ }).click();
    await pc.waitForURL(/compress-pdf/);
    const handed = await pc.getByText("merged.pdf").waitFor({ timeout: 10000 }).then(() => true, () => false);
    const dl2 = pc.waitForEvent("download", { timeout: 60000 }).then(() => true, () => false);
    await pc.locator("aside button").last().click();
    check(handed && (await dl2), "chain merge>comp", `handed=${handed}`);
    await pc.close();

    // chaining into a tool that needs a full page load (files go through IndexedDB)
    const pr = await ctx.newPage();
    await pr.goto(`${BASE}/crop-image`);
    await pr.setInputFiles('input[type="file"]', F("photo.png"));
    await pr.waitForSelector("img");
    const dl3 = pr.waitForEvent("download");
    await pr.locator("aside button").last().click();
    await dl3;
    await pr.getByRole("button", { name: /Supprimer l'arrière-plan/ }).click();
    await pr.waitForURL(/remove-bg/);
    const handedBg = await pr.getByText("photo_cropped.png").waitFor({ timeout: 10000 }).then(() => true, () => false);
    const dl4 = pr.waitForEvent("download", { timeout: 120000 }).then(() => true, () => false);
    if (handedBg) await pr.locator("aside button").last().click();
    check(handedBg && (await dl4), "chain crop>bg", `handed=${handedBg} (full page load)`);
    await pr.close();

    // theme toggle persists across reloads
    const pt = await ctx.newPage();
    await pt.goto(BASE);
    await pt.getByRole("button", { name: /Thème : automatique/ }).click(); // -> light
    await pt.getByRole("button", { name: /Thème : clair/ }).click(); // -> dark
    const dark1 = await pt.evaluate(() => document.documentElement.dataset.theme);
    await pt.reload();
    const dark2 = await pt.evaluate(() => document.documentElement.dataset.theme);
    await pt.getByRole("button", { name: /Thème : sombre/ }).click(); // -> back to system
    check(dark1 === "dark" && dark2 === "dark", "dark theme", `after click=${dark1} after reload=${dark2}`);
    await pt.close();

    // mobile menu
    const pm = await ctx.newPage();
    await pm.setViewportSize({ width: 390, height: 844 });
    await pm.goto(BASE);
    await pm.getByRole("button", { name: "Menu" }).click();
    check(await pm.getByRole("link", { name: "Outils image" }).isVisible(), "mobile menu", "");
    await pm.close();

    // keyboard: move a redaction area with the arrow keys
    const pk = await ctx.newPage();
    await pk.goto(`${BASE}/redact-pdf`);
    await pk.setInputFiles('input[type="file"]', F("a.pdf"));
    await pk.waitForSelector("[data-overlay]");
    const ob = await pk.locator("[data-overlay]").boundingBox();
    await pk.mouse.click(ob.x + ob.width * 0.3, ob.y + ob.height * 0.3);
    const area = pk.getByRole("button", { name: "Zone 1" });
    const before = await area.evaluate((el) => el.style.left);
    await area.focus();
    await pk.keyboard.press("Shift+ArrowRight");
    const after = await area.evaluate((el) => el.style.left);
    check(before !== after, "keyboard move", `${before} -> ${after}`);
    await pk.close();

    const p = await ctx.newPage();
    await p.goto(BASE);
    const recentOk = await p.getByRole("heading", { name: "Utilisés récemment" }).isVisible();
    await p.getByRole("button", { name: "Ajouter aux favoris" }).first().click();
    const favOk = await p.getByRole("heading", { name: "Favoris" }).isVisible();
    if (!recentOk || !favOk) process.exitCode = 1;
    console.log(`${recentOk && favOk ? "OK  " : "FAIL"} home shortcuts      recent=${recentOk} favorites=${favOk}`);
    await p.close();
  }
  await browser.close();
})();
