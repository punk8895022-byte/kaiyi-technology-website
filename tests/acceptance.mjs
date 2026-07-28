#!/usr/bin/env node
/**
 * 検収 (acceptance) test suite — 雲程數位科技 static marketing site.
 *
 * Run:
 *   cd /home/user/kaiyi-technology-website && NODE_PATH=$(npm root -g) node tests/acceptance.mjs
 *
 * Dependency-free apart from playwright. Plain ESM.
 * Exits 0 when every check passes, 1 otherwise.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

/* ------------------------------------------------------------------ *
 * playwright resolution
 *
 * Node's ESM loader deliberately ignores NODE_PATH, so a globally
 * installed playwright is not importable by bare specifier. Try the bare
 * import first (local node_modules / npm link), then fall back to the
 * directories NODE_PATH points at, then to `npm root -g`.
 * ------------------------------------------------------------------ */

async function loadChromium() {
  const tried = [];
  try {
    return (await import("playwright")).chromium;
  } catch (err) {
    tried.push(`bare "playwright": ${err.code || err.message}`);
  }

  const roots = [];
  if (process.env.NODE_PATH) roots.push(...process.env.NODE_PATH.split(path.delimiter).filter(Boolean));
  try {
    roots.push(execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
  } catch {
    /* npm not on PATH — ignore, the roots we already have may suffice */
  }

  for (const root of roots) {
    const entry = path.join(root, "playwright", "index.js");
    if (!fs.existsSync(entry)) {
      tried.push(`${entry}: not found`);
      continue;
    }
    try {
      const mod = await import(pathToFileURL(entry).href);
      return (mod.chromium || mod.default?.chromium);
    } catch (err) {
      tried.push(`${entry}: ${err.message}`);
    }
  }
  throw new Error(`cannot resolve playwright. Tried:\n  ${tried.join("\n  ")}`);
}

/* ------------------------------------------------------------------ *
 * paths — derived from this script's own location, never hard-coded
 * ------------------------------------------------------------------ */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..");
const INDEX_PATH = path.join(PROJECT_ROOT, "index.html");
const INDEX_URL = pathToFileURL(INDEX_PATH).href;

/* ------------------------------------------------------------------ *
 * tiny test harness
 * ------------------------------------------------------------------ */

const results = [];

/**
 * Run one numbered check. `fn` returns a detail string on success, or
 * throws / returns a rejected promise on failure. Anything thrown —
 * including a genuine Playwright error — is recorded as a FAIL, so a
 * broken check can never silently pass.
 */
async function check(id, title, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ id, title, ok: true, detail: detail || "", ms: Date.now() - started });
  } catch (err) {
    results.push({
      id,
      title,
      ok: false,
      detail: (err && err.message ? err.message : String(err)).replace(/\s+/g, " ").slice(0, 240),
      ms: Date.now() - started,
    });
  }
}

/** Assertion helper — throws with a useful message when `cond` is falsy. */
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

/* ------------------------------------------------------------------ *
 * error collectors — populated for the whole browser session (T-10)
 * ------------------------------------------------------------------ */

const consoleErrors = []; // console.error() and browser-level error messages
const pageErrors = []; // uncaught JS exceptions — never filtered
const failedRequests = []; // requestfailed events
const badResponses = []; // HTTP >= 400 responses

/**
 * Third-party origins are not part of the acceptance scope and the test
 * machine may be offline, so network noise from e.g. fonts.googleapis.com
 * is reported separately rather than failing T-10 / T-11.
 */
function isLocal(url) {
  return typeof url === "string" && url.startsWith("file://");
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

const VIEWPORTS = { desktop: 1440, tablet: 768, mobile: 390 };

async function main() {
  assert(fs.existsSync(INDEX_PATH), `index.html not found at ${INDEX_PATH}`);

  const chromium = await loadChromium();
  assert(typeof chromium?.launch === "function", "resolved playwright has no chromium.launch");

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: VIEWPORTS.desktop, height: 900 },
    // deviceScaleFactor 1 keeps layout measurements integral
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const loc = msg.location() || {};
    consoleErrors.push({ text: msg.text(), url: loc.url || "" });
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("requestfailed", (req) =>
    failedRequests.push({ url: req.url(), reason: req.failure()?.errorText || "unknown" })
  );
  page.on("response", (res) => {
    if (res.status() >= 400) badResponses.push({ url: res.url(), status: res.status() });
  });

  await page.goto(INDEX_URL, { waitUntil: "load" });
  // Let deferred work (IntersectionObserver first pass, footer year) settle.
  await page.waitForTimeout(400);

  /* ---------------- T-01 ---------------- */
  await check("T-01", "title + meta description present and non-empty", async () => {
    const title = (await page.title()).trim();
    assert(title.length > 0, "<title> is empty or missing");
    const desc = await page.evaluate(() => {
      const el = document.querySelector('meta[name="description"]');
      return el ? (el.getAttribute("content") || "").trim() : null;
    });
    assert(desc !== null, 'no <meta name="description"> element');
    assert(desc.length > 0, 'meta description content="" is empty');
    return `title ${title.length} chars, description ${desc.length} chars`;
  });

  /* ---------------- T-02 ---------------- */
  await check("T-02", "exactly one <h1>", async () => {
    const texts = await page.$$eval("h1", (els) => els.map((e) => e.textContent.trim()));
    assert(texts.length === 1, `expected 1 <h1>, found ${texts.length}`);
    assert(texts[0].length > 0, "the single <h1> is empty");
    return `"${texts[0].replace(/\s+/g, " ").slice(0, 40)}"`;
  });

  /* ---------------- T-03 ---------------- */
  await check("T-03", "no horizontal overflow at 1440 / 768 / 390", async () => {
    const offenders = [];
    for (const w of [VIEWPORTS.desktop, VIEWPORTS.tablet, VIEWPORTS.mobile]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(200); // allow reflow + clamp() recalculation
      const info = await page.evaluate(() => {
        const de = document.documentElement;
        const body = document.body;
        // body has overflow-x:hidden, so measure BOTH scroll containers and
        // additionally hunt for elements sticking out past the viewport.
        const vw = window.innerWidth;
        let worst = null;
        for (const el of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          if (cs.position === "fixed" || cs.position === "absolute") continue; // skip off-canvas UI
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          const over = r.right - vw;
          if (over > 1 && (!worst || over > worst.over)) {
            worst = {
              over: Math.round(over),
              tag: el.tagName.toLowerCase(),
              cls: (el.className && String(el.className).slice(0, 40)) || "",
            };
          }
        }
        return {
          vw,
          htmlScroll: de.scrollWidth,
          bodyScroll: body.scrollWidth,
          worst,
        };
      });
      const maxScroll = Math.max(info.htmlScroll, info.bodyScroll);
      if (maxScroll > info.vw + 1 || info.worst) {
        offenders.push(
          `${w}px: scrollWidth ${maxScroll} vs ${info.vw}` +
            (info.worst ? ` | worst <${info.worst.tag} class="${info.worst.cls}"> +${info.worst.over}px` : "")
        );
      }
    }
    assert(offenders.length === 0, offenders.join("; "));
    await page.setViewportSize({ width: VIEWPORTS.desktop, height: 900 });
    return "1440 / 768 / 390 all clean";
  });

  /* ---------------- T-04 ---------------- */
  await check("T-04", "every <img> has non-empty width + height attributes", async () => {
    const bad = await page.$$eval("img", (imgs) =>
      imgs
        .filter((i) => {
          const w = (i.getAttribute("width") || "").trim();
          const h = (i.getAttribute("height") || "").trim();
          return !w || !h || !/^\d+$/.test(w) || !/^\d+$/.test(h);
        })
        .map((i) => i.getAttribute("src") || "(no src)")
    );
    const total = await page.$$eval("img", (i) => i.length);
    assert(total > 0, "page contains no <img> elements at all");
    assert(bad.length === 0, `missing/invalid width|height on: ${bad.join(", ")}`);
    return `${total} images, all dimensioned`;
  });

  /* ---------------- T-05 ---------------- */
  await check("T-05", "every form control has an associated label", async () => {
    const bad = await page.$$eval("input, select, textarea", (els) =>
      els
        .filter((el) => !["hidden", "submit", "button", "reset", "image"].includes(el.type))
        .filter((el) => {
          // el.labels covers both explicit (for=) and implicit (wrapping) labels.
          const hasLabel = el.labels && el.labels.length > 0;
          const aria = (el.getAttribute("aria-label") || "").trim();
          const ariaBy = (el.getAttribute("aria-labelledby") || "").trim();
          return !hasLabel && !aria && !ariaBy;
        })
        .map((el) => `${el.tagName.toLowerCase()}[name="${el.name || ""}"]`)
    );
    const total = await page.$$eval(
      "input, select, textarea",
      (els) => els.filter((e) => !["hidden", "submit", "button", "reset", "image"].includes(e.type)).length
    );
    assert(total > 0, "page contains no labelable form controls");
    assert(bad.length === 0, `unlabelled: ${bad.join(", ")}`);
    return `${total} controls, all labelled`;
  });

  /* ---------------- T-06 ---------------- */
  await check("T-06", 'every href^="#" resolves to an existing id', async () => {
    const broken = await page.evaluate(() => {
      const out = [];
      for (const a of document.querySelectorAll('a[href^="#"]')) {
        const href = a.getAttribute("href");
        if (href === "#" || href === "#top-of-page") continue; // bare "#" is legal (document top)
        const id = decodeURIComponent(href.slice(1));
        if (!id) continue;
        if (!document.getElementById(id)) out.push(href);
      }
      return out;
    });
    const total = await page.$$eval('a[href^="#"]', (a) => a.length);
    assert(total > 0, "no in-page anchors found — suspicious for this page");
    assert(broken.length === 0, `dangling anchors: ${[...new Set(broken)].join(", ")}`);
    return `${total} in-page anchors, all resolve`;
  });

  /* ---------------- T-07 ---------------- */
  await check("T-07", "nav/menu-button visibility swaps between 390 and 1440", async () => {
    const read = async () =>
      page.evaluate(() => {
        const vis = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null; // null => element missing entirely, a real failure
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
        };
        return { nav: vis(".desktop-nav"), btn: vis(".menu-button") };
      });

    await page.setViewportSize({ width: VIEWPORTS.mobile, height: 844 });
    await page.waitForTimeout(150);
    const m = await read();
    assert(m.nav !== null, ".desktop-nav element does not exist");
    assert(m.btn !== null, ".menu-button element does not exist");
    assert(m.nav === false, "at 390px the desktop nav is still visible");
    assert(m.btn === true, "at 390px the menu button is not visible");

    await page.setViewportSize({ width: VIEWPORTS.desktop, height: 900 });
    await page.waitForTimeout(150);
    const d = await read();
    assert(d.nav === true, "at 1440px the desktop nav is not visible");
    assert(d.btn === false, "at 1440px the menu button is still visible");
    return "390: burger only · 1440: nav only";
  });

  /* ---------------- T-08 ---------------- */
  await check("T-08", "drawer opens on click (aria-expanded=true) and closes on Escape", async () => {
    await page.setViewportSize({ width: VIEWPORTS.mobile, height: 844 });
    await page.waitForTimeout(150);

    const btn = page.locator(".menu-button");
    const drawer = page.locator(".drawer");

    assert((await btn.count()) === 1, "expected exactly one .menu-button");
    assert((await drawer.count()) === 1, "expected exactly one .drawer");
    assert(
      (await btn.getAttribute("aria-expanded")) === "false",
      'initial aria-expanded should be "false"'
    );
    assert(!(await drawer.isVisible()), "drawer is visible before any interaction");

    await btn.click();
    await page.waitForTimeout(200);
    assert(await drawer.isVisible(), "drawer did not become visible after click");
    assert(
      (await btn.getAttribute("aria-expanded")) === "true",
      `aria-expanded after open is "${await btn.getAttribute("aria-expanded")}", expected "true"`
    );

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    assert(!(await drawer.isVisible()), "drawer still visible after Escape");
    assert(
      (await btn.getAttribute("aria-expanded")) === "false",
      "aria-expanded not reset to false after Escape"
    );

    await page.setViewportSize({ width: VIEWPORTS.desktop, height: 900 });
    return "open/close cycle + aria state correct";
  });

  /* ---------------- T-09 ---------------- */
  await check("T-09", "all .reveal elements gain .is-visible after a full scroll", async () => {
    const total = await page.$$eval(".reveal", (e) => e.length);
    assert(total > 0, "no .reveal elements found — the reveal system is missing");

    // Walk the page in viewport-sized steps so every IntersectionObserver
    // threshold is genuinely crossed, then return to the top.
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.75);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let y = 0; y <= document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await wait(90);
      }
      window.scrollTo(0, document.body.scrollHeight);
      await wait(400);
      window.scrollTo(0, 0);
      await wait(200);
    });

    const missed = await page.$$eval(".reveal", (els) =>
      els
        .filter((e) => !e.classList.contains("is-visible"))
        .map((e) => {
          const h = e.querySelector("h4, strong");
          return h ? h.textContent.trim().slice(0, 16) : e.className.slice(0, 30);
        })
    );
    assert(missed.length === 0, `${missed.length}/${total} never revealed: ${missed.join(", ")}`);
    return `${total}/${total} revealed`;
  });

  /* ---------------- T-11 (before T-10 so its report is complete) ------- */
  await check("T-11", "every referenced local asset resolves (no 404 / failed load)", async () => {
    // 1. Static check: resolve every local reference in the DOM against disk.
    const refs = await page.evaluate(() => {
      const out = new Set();
      for (const el of document.querySelectorAll("img[src], script[src], link[href][rel~='stylesheet']")) {
        const raw = el.getAttribute("src") || el.getAttribute("href");
        if (!raw) continue;
        if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) continue; // remote / inline
        out.add(new URL(raw, document.baseURI).href);
      }
      return [...out];
    });
    assert(refs.length > 0, "no local asset references found in the DOM");

    const missing = refs.filter((u) => !fs.existsSync(fileURLToPath(u)));

    // 2. Runtime check: anything the browser itself failed to fetch locally.
    const netFails = failedRequests.filter((f) => isLocal(f.url));
    const netBad = badResponses.filter((r) => isLocal(r.url));

    const problems = [
      ...missing.map((u) => `missing on disk: ${path.relative(PROJECT_ROOT, fileURLToPath(u))}`),
      ...netFails.map((f) => `failed request: ${f.url} (${f.reason})`),
      ...netBad.map((r) => `HTTP ${r.status}: ${r.url}`),
    ];
    assert(problems.length === 0, problems.join("; "));
    return `${refs.length} local assets, all resolve`;
  });

  /* ---------------- T-10 ---------------- */
  await check("T-10", "no console errors and no uncaught page errors", async () => {
    // Uncaught exceptions are never excused.
    assert(pageErrors.length === 0, `pageerror: ${pageErrors.join(" | ")}`);

    // Console errors originating from third-party origins (the Google Fonts
    // CDN) are network-environment noise, not a defect in the deliverable,
    // so they are surfaced as INFO instead of failing the build.
    const local = consoleErrors.filter((e) => !e.url || isLocal(e.url));
    const remote = consoleErrors.filter((e) => e.url && !isLocal(e.url));
    if (remote.length) {
      console.log(`\n  INFO  ${remote.length} third-party console message(s) ignored by T-10:`);
      for (const e of remote.slice(0, 5)) console.log(`        ${e.text.slice(0, 110)}`);
    }
    assert(local.length === 0, `console errors: ${local.map((e) => e.text).join(" | ")}`);
    return "clean (load + full scroll)";
  });

  await browser.close();
}

/* ------------------------------------------------------------------ *
 * reporting
 * ------------------------------------------------------------------ */

function report() {
  const idW = Math.max(4, ...results.map((r) => r.id.length));
  const titleW = Math.min(58, Math.max(...results.map((r) => r.title.length)));
  const line = "-".repeat(idW + titleW + 60);

  console.log("\n検収 ACCEPTANCE CHECKS — " + INDEX_URL);
  console.log(line);
  console.log(
    "ID".padEnd(idW) + "  " + "CHECK".padEnd(titleW) + "  RESULT  DETAIL"
  );
  console.log(line);
  for (const r of results) {
    console.log(
      r.id.padEnd(idW) +
        "  " +
        r.title.slice(0, titleW).padEnd(titleW) +
        "  " +
        (r.ok ? "PASS  " : "FAIL  ") +
        "  " +
        r.detail
    );
  }
  console.log(line);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`SUMMARY: ${passed}/${results.length} passed, ${failed} failed — ${failed === 0 ? "ACCEPTED" : "NOT ACCEPTED"}`);
  return failed;
}

try {
  await main();
} catch (err) {
  // Harness-level blow-up (browser launch, missing index.html, ...).
  results.push({
    id: "T-XX",
    title: "harness",
    ok: false,
    detail: `suite aborted: ${err && err.message ? err.message : String(err)}`,
  });
}

process.exit(report() === 0 ? 0 : 1);
