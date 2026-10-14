// Site audit (./e2e/audit.sh): every page in both locales, light/dark, desktop/mobile.
// Reports console errors, page errors, failed requests, horizontal overflow, theme loss on navigation.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const ORIGIN = process.env.ORIGIN || "http://localhost:3000";
const OUT = path.join(__dirname, "out", "audit");
fs.mkdirSync(OUT, { recursive: true });
const issues = [];
const note = (...a) => { issues.push(a.join(" ")); console.log(...a); };

(async () => {
  // tool pages are the links of the home grid
  const home = await (await fetch(`${ORIGIN}/fr`)).text();
  const ids = [...new Set([...home.matchAll(/href="\/fr\/([a-z0-9-]+)"/g)].map((m) => m[1]))].filter((i) => !["legal", "privacy"].includes(i));
  const pages = ["", "/legal", "/privacy", "/does-not-exist", ...ids.map((i) => `/${i}`)];
  const browser = await chromium.launch();
  for (const theme of ["light", "dark"]) {
    for (const vp of [{ width: 1280, height: 800, n: "d" }, { width: 375, height: 740, n: "m" }]) {
      const ctx = await browser.newContext({ viewport: vp, locale: "fr-FR" });
      await ctx.addInitScript((t) => { try { localStorage.setItem("ihp:theme", t); } catch {} }, theme);
      const page = await ctx.newPage();
      let cur = "";
      page.on("console", (m) => { if (cur.includes("does-not-exist") && m.text().includes("404")) return; if (m.type() === "error" || m.type() === "warning") note(`[console.${m.type()}] ${theme}/${vp.n} ${cur}: ${m.text().slice(0, 300)}`); });
      page.on("pageerror", (e) => note(`[pageerror] ${theme}/${vp.n} ${cur}: ${e.message.slice(0, 300)}`));
      page.on("requestfailed", (r) => note(`[reqfail] ${theme}/${vp.n} ${cur}: ${r.url()} ${r.failure()?.errorText}`));
      page.on("response", (r) => { if (r.status() >= 400 && !cur.includes("does-not-exist")) note(`[http ${r.status()}] ${theme}/${vp.n} ${cur}: ${r.url()}`); });
      for (const loc of ["fr", "en"]) {
        for (const p of pages) {
          cur = `/${loc}${p}`;
          await page.goto(ORIGIN + cur, { waitUntil: "networkidle" }).catch((e) => note(`[goto] ${cur} ${e.message}`));
          await page.waitForTimeout(200);
          const r = await page.evaluate(() => ({
            theme: document.documentElement.dataset.theme,
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            lang: document.documentElement.lang,
            title: document.title,
            wide: [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== "fixed").slice(0, 3).map((e) => e.tagName + "." + (e.className?.baseVal ?? e.className).toString().slice(0, 60)),
          }));
          if (r.theme !== theme) note(`[theme] ${theme}/${vp.n} ${cur}: got ${r.theme}`);
          if (r.overflow > 1) note(`[overflow] ${theme}/${vp.n} ${cur}: +${r.overflow}px ${r.wide.join(" | ")}`);
          if (r.lang !== loc) note(`[lang] ${cur}: ${r.lang}`);
          const shot = `${theme}-${vp.n}-${loc}${p.replace(/\//g, "_") || "_home"}.png`;
          if (loc === "fr" || p === "") await page.screenshot({ path: path.join(OUT, shot), fullPage: vp.n === "d" && p === "" });
        }
      }
      // client-side navigations keep the theme
      cur = "nav";
      await page.goto(ORIGIN + "/fr", { waitUntil: "networkidle" });
      if (vp.n === "d") {
        await page.getByRole("link", { name: "en", exact: true }).click();
        await page.waitForURL("**/en");
        await page.waitForTimeout(500);
        let t = await page.evaluate(() => document.documentElement.dataset.theme);
        if (t !== theme) note(`[theme] ${theme}: lost after locale switch home (${t})`);
        await page.goto(ORIGIN + "/fr/merge-pdf", { waitUntil: "networkidle" });
        await page.getByRole("link", { name: "en", exact: true }).click();
        await page.waitForURL("**/en/merge-pdf");
        await page.waitForTimeout(500);
        t = await page.evaluate(() => document.documentElement.dataset.theme);
        if (t !== theme) note(`[theme] ${theme}: lost after locale switch tool (${t})`);
        await page.locator("a[href='/en']").first().click();
        await page.waitForURL("**/en");
        await page.waitForTimeout(300);
        t = await page.evaluate(() => document.documentElement.dataset.theme);
        if (t !== theme) note(`[theme] ${theme}: lost after logo nav (${t})`);
        await page.locator("a[href='/en/compress-pdf']").first().click();
        await page.waitForURL("**/en/compress-pdf");
        await page.waitForTimeout(300);
        t = await page.evaluate(() => document.documentElement.dataset.theme);
        if (t !== theme) note(`[theme] ${theme}: lost after tool nav (${t})`);
      }
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "issues.txt"), issues.join("\n"));
  console.log(`\n${issues.length} issues`);
})();
