// Contract correctness smoke for demos/interaction-benchmark/CONTRACT.md v1: trusted Playwright input, exact expected values, no timing.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../../../..");
const port = Number(process.env.SMOKE_PORT ?? 4461);
const origin = `http://127.0.0.1:${port}`;
const ENTRANT = "solidstart";
const TIMEOUT = 10_000;

async function loadChromium() {
  const candidates = [];
  try {
    candidates.push(createRequire(join(repoRoot, "package.json")).resolve("playwright"));
  } catch {}
  candidates.push(join(repoRoot, "node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.js"));
  for (const file of candidates) {
    if (existsSync(file)) return createRequire(import.meta.url)(file).chromium;
  }
  throw new Error("playwright not found from repo root");
}

async function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server did not start at ${url}`);
}

const results = [];
let failed = 0;

function check(cond, message) {
  if (!cond) throw new Error(message);
}

// Polls a DOM predicate (run in the page) until it returns true; on timeout reports the snapshot it returned.
async function until(page, label, fn, arg) {
  try {
    await page.waitForFunction(fn, arg, { timeout: TIMEOUT, polling: "raf" });
  } catch {
    const snapshot = await page.evaluate(() => `url=${location.pathname} title=${document.title}`).catch(() => "no page");
    throw new Error(`timeout waiting for: ${label} (${snapshot})`);
  }
}

const q = (id) => `[data-testid="${id}"]`;
const text = (page, id) => page.locator(q(id)).first().textContent();
const attr = (page, id, name) => page.locator(q(id)).first().getAttribute(name);
const focusedTestId = (page) => page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
const row = (page, id) => page.locator(`tr[data-testid="record-row"][data-id="${id}"]`);
const selectAll = (page) => page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");

async function replaceText(page, id, value) {
  await page.getByTestId(id).click();
  await selectAll(page);
  await page.keyboard.insertText(value);
}

let browser;

async function visit(path, phase) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource: the server responded with a status of 422/.test(m.text())) errors.push(`console.error: ${m.text()}`);
  });
  const settingsRequests = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/api/settings") settingsRequests.push(req);
  });
  if (phase === "early") {
    await page.goto(origin + path, { waitUntil: "commit" });
  } else {
    await page.goto(origin + path, { waitUntil: "load" });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
  }
  return { context, page, errors, settingsRequests };
}

async function runCase(id, phases, path, body) {
  for (const phase of phases) {
    const name = `${id} [${phase}]`;
    const v = await visit(path, phase);
    try {
      await body(v.page, v);
      check(v.errors.length === 0, `page errors: ${v.errors.join("; ")}`);
      results.push({ id, phase, result: "pass" });
      console.log(`ok - ${name}`);
    } catch (err) {
      failed++;
      results.push({ id, phase, result: "fail", reason: err.message });
      console.log(`not ok - ${name}: ${err.message}`);
    } finally {
      await v.context.close();
    }
  }
}

const EARLY = ["early", "settled"];
const SETTLED = ["settled"];
const TITLES = { "/": "Overview", "/records": "Records", "/settings": "Settings" };

const server = spawn(process.execPath, [join(appDir, ".output/server/index.mjs")], {
  cwd: appDir,
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", NITRO_PORT: String(port) },
  stdio: ["ignore", "inherit", "inherit"],
});

try {
  await waitForServer(`${origin}/`);

  for (const [path, title] of Object.entries(TITLES)) {
    const html = await (await fetch(origin + path)).text();
    const name = `ssr-document ${path}`;
    try {
      check(/^<!DOCTYPE html><html\b[^>]*\slang="en"[^>]*>/i.test(html), "html lang=en");
      check(html.includes('<meta charset="utf-8">'), "meta charset");
      check(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'), "viewport");
      check(html.includes(`<meta name="benchmark:entrant" content="${ENTRANT}">`), "entrant meta");
      check(/<meta name="benchmark:build" content="[^"]+">/.test(html), "build meta");
      check(new RegExp(`<title[^>]*>${title} \\| Interaction benchmark</title>`).test(html), "SSR title");
      check(new RegExp(`<h1[^>]*class="page-title"[^>]*data-testid="page-title"[^>]*>${title}</h1>`).test(html), "SSR page-title");
      if (path === "/records") check((html.match(/data-testid="record-row"/g) ?? []).length === 200, "SSR 200 rows");
      results.push({ id: name, phase: "ssr", result: "pass" });
      console.log(`ok - ${name}`);
    } catch (err) {
      failed++;
      results.push({ id: name, phase: "ssr", result: "fail", reason: err.message });
      console.log(`not ok - ${name}: ${err.message}`);
    }
  }

  {
    const name = "api-settings-endpoint";
    try {
      const t0 = Date.now();
      const ok = await fetch(`${origin}/api/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Ada Lovelace", email: "ada@example.test", quantity: "2", unitPrice: "12.50" }),
      });
      const elapsed = Date.now() - t0;
      check(ok.status === 200, `200 status, got ${ok.status}`);
      check(elapsed >= 300, `>= 300 ms delay, got ${elapsed}`);
      check(ok.headers.get("content-type") === "application/json", "content-type json");
      check(ok.headers.get("cache-control") === "no-store", "cache-control no-store");
      const okBody = await ok.json();
      check(okBody.message === "Saved Ada Lovelace, total $25.00" && okBody.ok === true, `body ${JSON.stringify(okBody)}`);
      const rejected = await fetch(`${origin}/api/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: " FAIL ", email: "a@b.cd", quantity: "2", unitPrice: "1" }),
      });
      check(rejected.status === 422, `422 for fail, got ${rejected.status}`);
      check((await rejected.json()).error === "The server rejected this display name.", "422 message");
      const garbage = await fetch(`${origin}/api/settings`, { method: "POST", body: "{nope" });
      check(garbage.status === 400, `unparseable body treated as {} -> 400, got ${garbage.status}`);
      for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
        const res = await fetch(`${origin}/api/settings`, { method });
        check(res.status === 405, `${method} -> 405, got ${res.status}`);
      }
      results.push({ id: name, phase: "http", result: "pass" });
      console.log(`ok - ${name}`);
    } catch (err) {
      failed++;
      results.push({ id: name, phase: "http", result: "fail", reason: err.message });
      console.log(`not ok - ${name}: ${err.message}`);
    }
  }

  browser = await (await loadChromium()).launch();

  await runCase("layout-and-identity", SETTLED, "/", async (page) => {
    check((await page.title()) === "Overview | Interaction benchmark", "document.title");
    check((await attr(page, "nav-overview", "aria-current")) === "page", "overview aria-current");
    check((await attr(page, "nav-records", "aria-current")) === null, "records no aria-current");
    for (const sel of [".app > header.app-header > span.app-brand", "nav.app-nav[aria-label=Main]", "div.app-body > aside.sidebar[aria-label=Sections] > ul.tree", "main.main > h1.page-title"])
      check((await page.locator(sel).count()) === 1, `structure ${sel}`);
    for (const g of ["guides", "advanced", "reference", "plugins"]) {
      const b = page.getByTestId(`disclosure-${g}`);
      check((await b.getAttribute("aria-expanded")) === "false", `${g} collapsed`);
      check((await b.getAttribute("aria-controls")) === `disclosure-panel-${g}`, `${g} aria-controls`);
      check((await b.getAttribute("type")) === "button", `${g} type=button`);
      check(!(await page.getByTestId(`disclosure-panel-${g}`).isVisible()), `${g} panel hidden`);
    }
    check((await text(page, "counter-value")) === "0", "counter 0");
    check((await text(page, "toggle-status")) === "Off", "toggle Off");
    check((await text(page, "stepper-value")) === "5", "stepper 5");
    check((await text(page, "stepper-derived")) === "Squared: 25", "Squared: 25");
    check((await text(page, "stepper-decrement")) === "−", "decrement text U+2212");
    check((await text(page, "tab-panel")) === "Summary: 200 records across 5 teams.", "initial tab panel");
    check((await attr(page, "tab-summary", "tabindex")) === "0" && (await attr(page, "tab-notes", "tabindex")) === "-1", "tab tabindex");
    check((await text(page, "filter-count")) === "12 items", "12 items");
    check((await page.getByTestId("filter-item").count()) === 12, "12 filter items");
    check((await page.locator(".panel .panel-title").allTextContents()).join() === "Counter,Toggle,Stepper", "panel titles");
    check((await page.locator(".prose > p").count()) === 3, "3 prose paragraphs");
  });

  await runCase("overview-counter-first", EARLY, "/", async (page) => {
    await page.getByTestId("counter-increment").click();
    await until(page, "counter 1", () => document.querySelector('[data-testid="counter-value"]')?.textContent === "1");
    await page.waitForTimeout(300);
    check((await text(page, "counter-value")) === "1", "counter stays 1");
  });

  await runCase("overview-counter-repeat-x10", EARLY, "/", async (page) => {
    const button = page.getByTestId("counter-increment");
    await button.waitFor({ state: "visible" });
    const box = await button.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await Promise.all(Array.from({ length: 10 }, () => page.mouse.click(x, y)));
    await until(page, "counter 10", () => document.querySelector('[data-testid="counter-value"]')?.textContent === "10");
    await page.waitForTimeout(500);
    check((await text(page, "counter-value")) === "10", "counter stays 10 (no duplicates)");
  });

  await runCase("overview-counter-keyboard", SETTLED, "/", async (page) => {
    await page.getByTestId("counter-increment").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await until(page, "counter 2", () => document.querySelector('[data-testid="counter-value"]')?.textContent === "2");
  });

  await runCase("overview-independent-panel", SETTLED, "/", async (page) => {
    await page.getByTestId("counter-increment").click();
    await until(page, "counter 1", () => document.querySelector('[data-testid="counter-value"]')?.textContent === "1");
    await page.getByTestId("stepper-increment").click();
    await until(page, "stepper 6", () => document.querySelector('[data-testid="stepper-value"]')?.textContent === "6");
    check((await text(page, "stepper-derived")) === "Squared: 36", "Squared: 36");
    check((await text(page, "counter-value")) === "1", "counter still 1");
    check((await text(page, "toggle-status")) === "Off", "toggle still Off");
    check((await attr(page, "toggle-button", "aria-pressed")) === "false", "toggle still unpressed");
  });

  await runCase("overview-stepper-bounds", SETTLED, "/", async (page) => {
    for (let i = 0; i < 5; i++) await page.getByTestId("stepper-increment").click();
    await until(page, "stepper 10", () => document.querySelector('[data-testid="stepper-value"]')?.textContent === "10");
    check(await page.getByTestId("stepper-increment").isDisabled(), "increment disabled at 10");
    for (let i = 0; i < 10; i++) await page.getByTestId("stepper-decrement").click();
    await until(page, "stepper 0", () => document.querySelector('[data-testid="stepper-value"]')?.textContent === "0");
    check(await page.getByTestId("stepper-decrement").isDisabled(), "decrement disabled at 0");
    check((await text(page, "stepper-derived")) === "Squared: 0", "Squared: 0");
  });

  await runCase("overview-toggle", EARLY, "/", async (page) => {
    await page.getByTestId("toggle-button").focus();
    await page.keyboard.press("Space");
    await until(page, "toggle On", () => {
      const b = document.querySelector('[data-testid="toggle-button"]');
      return b?.getAttribute("aria-pressed") === "true" && document.querySelector('[data-testid="toggle-status"]')?.textContent === "On";
    });
  });

  {
    const name = "hydration-keeps-focus";
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      let release;
      const gate = new Promise((r) => (release = r));
      await page.route(/\/assets\/.*entry-client.*\.js$/, async (route) => {
        await gate;
        await route.continue();
      });
      await page.goto(`${origin}/`, { waitUntil: "commit" });
      await page.getByTestId("toggle-button").focus();
      release();
      await until(page, "hydrated", () => window._$HY?.done === true || document.querySelector('[data-testid="nav-overview"]')?.getAttribute("aria-current") === "page");
      check((await focusedTestId(page)) === "toggle-button", `focus kept across hydration, got ${await focusedTestId(page)}`);
      await page.keyboard.press("Space");
      await until(page, "toggle On", () => document.querySelector('[data-testid="toggle-status"]')?.textContent === "On");
      results.push({ id: name, phase: "hydration", result: "pass" });
      console.log(`ok - ${name}`);
    } catch (err) {
      failed++;
      results.push({ id: name, phase: "hydration", result: "fail", reason: err.message });
      console.log(`not ok - ${name}: ${err.message}`);
    } finally {
      await context.close();
    }
  }

  await runCase("overview-disclosure", EARLY, "/", async (page) => {
    await page.getByTestId("disclosure-guides").click();
    await until(page, "guides open", () => document.querySelector('[data-testid="disclosure-guides"]')?.getAttribute("aria-expanded") === "true");
    await page.getByTestId("tree-leaf-getting-started").waitFor({ state: "visible", timeout: TIMEOUT });
  });

  await runCase("overview-disclosure-nested", SETTLED, "/", async (page) => {
    await page.getByTestId("disclosure-guides").click();
    await until(page, "guides open", () => document.querySelector('[data-testid="disclosure-guides"]')?.getAttribute("aria-expanded") === "true");
    await page.getByTestId("disclosure-advanced").click();
    await until(page, "advanced open", () => document.querySelector('[data-testid="disclosure-advanced"]')?.getAttribute("aria-expanded") === "true");
    check(await page.getByTestId("tree-leaf-caching").isVisible(), "caching visible");
    check(await page.getByTestId("tree-leaf-streaming").isVisible(), "streaming visible");
    await page.getByTestId("disclosure-guides").press("Enter");
    await until(page, "guides closed", () => document.querySelector('[data-testid="disclosure-guides"]')?.getAttribute("aria-expanded") === "false");
    check(!(await page.getByTestId("tree-leaf-caching").isVisible()), "caching hidden when parent collapses");
    await page.getByTestId("disclosure-guides").press("Space");
    await until(page, "guides reopened", () => document.querySelector('[data-testid="disclosure-guides"]')?.getAttribute("aria-expanded") === "true");
    check((await attr(page, "disclosure-advanced", "aria-expanded")) === "true", "nested keeps its state");
    check(await page.getByTestId("tree-leaf-caching").isVisible(), "caching visible again");
  });

  await runCase("overview-tab", EARLY, "/", async (page) => {
    await page.getByTestId("tab-activity").click();
    await until(page, "activity selected", () => {
      const a = document.querySelector('[data-testid="tab-activity"]');
      const s = document.querySelector('[data-testid="tab-summary"]');
      const p = document.querySelector('[data-testid="tab-panel"]');
      return a?.getAttribute("aria-selected") === "true" && s?.getAttribute("aria-selected") === "false" && p?.textContent === "Activity: 12 updates in the last 24 hours.";
    });
    check((await attr(page, "tab-panel", "aria-labelledby")) === "tab-activity", "panel aria-labelledby");
  });

  await runCase("overview-tab-keyboard", SETTLED, "/", async (page) => {
    await page.getByTestId("tab-summary").focus();
    await page.keyboard.press("ArrowRight");
    check((await focusedTestId(page)) === "tab-activity" && (await attr(page, "tab-activity", "aria-selected")) === "true", "ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    check((await focusedTestId(page)) === "tab-summary" && (await attr(page, "tab-summary", "aria-selected")) === "true", "ArrowRight wraps");
    await page.keyboard.press("ArrowLeft");
    check((await focusedTestId(page)) === "tab-notes" && (await text(page, "tab-panel")) === "Notes: No open issues.", "ArrowLeft wraps");
    await page.keyboard.press("Home");
    check((await focusedTestId(page)) === "tab-summary", "Home");
    await page.keyboard.press("End");
    check((await focusedTestId(page)) === "tab-notes" && (await attr(page, "tab-notes", "tabindex")) === "0", "End");
    await page.getByTestId("tab-activity").focus();
    await page.keyboard.press("Enter");
    check((await attr(page, "tab-activity", "aria-selected")) === "true", "Enter selects");
  });

  await runCase("overview-filter", EARLY, "/", async (page) => {
    await page.getByTestId("filter-input").click();
    await page.keyboard.insertText("berry");
    await until(page, "2 items", () => {
      const items = [...document.querySelectorAll('[data-testid="filter-item"]')].map((li) => li.textContent);
      return document.querySelector('[data-testid="filter-count"]')?.textContent === "2 items" && items.join() === "Blueberry,Elderberry";
    });
    check((await page.getByTestId("filter-empty").count()) === 0, "no filter-empty");
    await selectAll(page);
    await page.keyboard.insertText("zzz");
    await until(page, "no match", () => document.querySelector('[data-testid="filter-empty"]')?.textContent === "No matching items");
    check((await text(page, "filter-count")) === "0 items", "0 items");
    check((await page.getByTestId("filter-item").count()) === 0, "list empty");
  });

  await runCase("records-search", EARLY, "/records", async (page) => {
    await page.getByTestId("records-search").click();
    await page.keyboard.insertText("knuth");
    await until(page, "15 rows", () => {
      const rows = document.querySelectorAll('[data-testid="record-row"]');
      return document.querySelector('[data-testid="records-count"]')?.textContent === "Showing 15 of 200" && rows.length === 15 && rows[0].getAttribute("data-id") === "r016";
    });
    await selectAll(page);
    await page.keyboard.insertText("no-such-record");
    await until(page, "empty row", () => document.querySelector('[data-testid="records-empty"]')?.textContent === "No records match");
    check((await attr(page, "records-empty", "colspan")) === "7", "colspan 7");
  });

  await runCase("records-sort", EARLY, "/records", async (page) => {
    const scoreTh = page.locator("th", { has: page.getByTestId("sort-score") });
    const nameTh = page.locator("th", { has: page.getByTestId("sort-name") });
    await page.getByTestId("sort-score").click();
    await until(page, "score ascending", () => {
      const rows = document.querySelectorAll('[data-testid="record-row"]');
      const th = document.querySelector('[data-testid="sort-score"]')?.closest("th");
      return th?.getAttribute("aria-sort") === "ascending" && rows[0]?.getAttribute("data-id") === "r004" && rows[rows.length - 1]?.getAttribute("data-id") === "r147";
    });
    check((await nameTh.getAttribute("aria-sort")) === "none", "name th none");
    check((await scoreTh.getAttribute("aria-sort")) === "ascending", "score th ascending");
  });

  await runCase("records-sort-toggle", SETTLED, "/records", async (page) => {
    check((await page.locator("th[aria-sort=none]").count()) === 2, "both th none initially");
    await page.getByTestId("sort-score").click();
    await until(page, "ascending", () => document.querySelector('[data-testid="sort-score"]')?.closest("th")?.getAttribute("aria-sort") === "ascending");
    await page.getByTestId("sort-score").click();
    await until(page, "descending r147", () => {
      const th = document.querySelector('[data-testid="sort-score"]')?.closest("th");
      return th?.getAttribute("aria-sort") === "descending" && document.querySelector('[data-testid="record-row"]')?.getAttribute("data-id") === "r147";
    });
    await page.getByTestId("sort-name").click();
    await until(page, "name r028", () => {
      const first = document.querySelector('[data-testid="record-row"]');
      return first?.getAttribute("data-id") === "r028" && first.querySelector('[data-testid="record-name"]')?.textContent === "Ada Engelbart";
    });
    check((await page.locator("th", { has: page.getByTestId("sort-score") }).getAttribute("aria-sort")) === "none", "score th back to none");
  });

  await runCase("records-select", EARLY, "/records", async (page) => {
    await row(page, "r003").getByTestId("record-select").click();
    await until(page, "1 selected", () => {
      const box = document.querySelector('tr[data-id="r003"] [data-testid="record-select"]');
      return box?.checked === true && document.querySelector('[data-testid="selection-summary"]')?.textContent === "1 selected";
    });
  });

  await runCase("records-select-persists", SETTLED, "/records", async (page) => {
    const keptId = await page.evaluate(() => [...document.querySelectorAll("[data-testid=record-row]")].find((r) => r.querySelector("[data-testid=record-name]").textContent.startsWith("Ada "))?.getAttribute("data-id"));
    const rowEl = await row(page, keptId).elementHandle();
    await row(page, "r016").getByTestId("record-select").press("Space");
    await until(page, "1 selected", () => document.querySelector('[data-testid="selection-summary"]')?.textContent === "1 selected");
    await page.getByTestId("records-search").click();
    await page.keyboard.insertText("ada");
    await until(page, "filtered", () => document.querySelectorAll('[data-testid="record-row"]').length < 200);
    await page.getByTestId("sort-score").click();
    check(await rowEl.evaluate((el) => el.isConnected), "row DOM identity survives search + sort");
    await replaceText(page, "records-search", "");
    await page.keyboard.press("Backspace");
    await until(page, "200 again", () => document.querySelectorAll('[data-testid="record-row"]').length === 200);
    check(await row(page, "r016").getByTestId("record-select").isChecked(), "r016 still checked");
    check((await text(page, "selection-summary")) === "1 selected", "still 1 selected");
    check(await rowEl.evaluate((el) => el.isConnected), "row DOM identity of a still-visible record survives search and sort");
  });

  await runCase("records-dialog-open", EARLY, "/records", async (page) => {
    await row(page, "r001").getByTestId("record-edit").click();
    await until(page, "dialog open", () => {
      const d = document.querySelector('[data-testid="edit-dialog"]');
      const input = document.querySelector('[data-testid="edit-name"]');
      return d && d.checkVisibility() && input?.value === "Katherine Hopper" && document.activeElement === input;
    });
    check((await attr(page, "edit-dialog", "aria-labelledby")) === "edit-dialog-title", "aria-labelledby");
    check((await text(page, "edit-dialog-title")) === "Edit record", "dialog title");
    check(await page.getByTestId("edit-dialog").evaluate((d) => d.tagName === "DIALOG" && d.open && d.matches(":modal")), "native modal dialog");
  });

  await runCase("records-dialog-save", SETTLED, "/records", async (page) => {
    await row(page, "r003").getByTestId("record-select").click();
    await until(page, "1 selected", () => document.querySelector('[data-testid="selection-summary"]')?.textContent === "1 selected");
    await row(page, "r001").getByTestId("record-edit").click();
    await until(page, "focus edit-name", () => document.activeElement?.getAttribute("data-testid") === "edit-name");
    await selectAll(page);
    await page.keyboard.insertText("Renamed Record");
    await page.getByTestId("edit-save").click();
    await until(page, "saved", () => {
      const r = document.querySelector('tr[data-id="r001"]');
      return (
        !document.querySelector('[data-testid="edit-dialog"]')?.checkVisibility() &&
        r?.querySelector('[data-testid="record-name"]')?.textContent === "Renamed Record" &&
        document.querySelector('[data-testid="selection-summary"]')?.textContent === "1 selected" &&
        document.activeElement === r.querySelector('[data-testid="record-edit"]')
      );
    });
    check((await row(page, "r001").getByTestId("record-edit").getAttribute("aria-label")) === "Edit Renamed Record", "edit aria-label updated");
    check((await row(page, "r001").getByTestId("record-select").getAttribute("aria-label")) === "Select Renamed Record", "select aria-label updated");
  });

  await runCase("records-dialog-save-resort", SETTLED, "/records", async (page) => {
    await page.getByTestId("sort-name").click();
    await until(page, "name sort", () => document.querySelector('[data-testid="record-row"]')?.getAttribute("data-id") === "r028");
    await row(page, "r001").getByTestId("record-edit").click();
    await until(page, "focus edit-name", () => document.activeElement?.getAttribute("data-testid") === "edit-name");
    await selectAll(page);
    await page.keyboard.insertText("   ");
    check(await page.getByTestId("edit-save").isDisabled(), "save disabled when blank");
    await selectAll(page);
    await page.keyboard.insertText("  AAA First  ");
    await page.keyboard.press("Enter");
    await until(page, "resorted", () => {
      const first = document.querySelector('[data-testid="record-row"]');
      return first?.getAttribute("data-id") === "r001" && first.querySelector('[data-testid="record-name"]')?.textContent === "AAA First" && document.activeElement === first.querySelector('[data-testid="record-edit"]');
    });
    check((await page.getByTestId("record-row").count()) === 200, "200 rows");
  });

  await runCase("records-dialog-cancel", SETTLED, "/records", async (page) => {
    await row(page, "r002").getByTestId("record-edit").click();
    await until(page, "focus edit-name", () => document.activeElement?.getAttribute("data-testid") === "edit-name");
    await page.keyboard.insertText("changed");
    await page.keyboard.press("Escape");
    await until(page, "closed", () => {
      const r = document.querySelector('tr[data-id="r002"]');
      return (
        !document.querySelector('[data-testid="edit-dialog"]')?.checkVisibility() &&
        r?.querySelector('[data-testid="record-name"]')?.textContent === "Hedy Floyd" &&
        document.activeElement === r.querySelector('[data-testid="record-edit"]')
      );
    });
    await row(page, "r002").getByTestId("record-edit").click();
    await until(page, "reopened", () => document.querySelector('[data-testid="edit-name"]')?.value === "Hedy Floyd");
    check((await page.getByTestId("edit-dialog").count()) === 1, "one dialog");
    await page.getByTestId("edit-cancel").click();
    await until(page, "cancel closes", () => !document.querySelector('[data-testid="edit-dialog"]')?.checkVisibility() && document.activeElement === document.querySelector('tr[data-id="r002"] [data-testid="record-edit"]'));
  });

  await runCase("settings-derived", EARLY, "/settings", async (page) => {
    await page.getByTestId("settings-quantity").click();
    await selectAll(page);
    await page.keyboard.insertText("3");
    await until(page, "Total $37.50", () => document.querySelector('[data-testid="settings-total"]')?.textContent === "Total: $37.50");
    await selectAll(page);
    await page.keyboard.insertText("x");
    await until(page, "n/a", () => document.querySelector('[data-testid="settings-total"]')?.textContent === "Total: n/a");
    check((await page.locator(".field-error").count()) === 0, "no errors before submit");
  });

  await runCase("settings-initial", SETTLED, "/settings", async (page) => {
    const expected = { "settings-name": "Ada Lovelace", "settings-email": "ada@example.test", "settings-quantity": "2", "settings-unit-price": "12.50" };
    for (const [id, value] of Object.entries(expected)) check((await page.getByTestId(id).inputValue()) === value, `${id} initial`);
    check((await text(page, "settings-total")) === "Total: $25.00", "Total $25.00");
    check((await text(page, "settings-status")) === "", "status empty");
    check((await attr(page, "settings-form", "novalidate")) !== null, "novalidate");
    check((await attr(page, "settings-quantity", "inputmode")) === "numeric", "quantity inputmode");
    check((await attr(page, "settings-unit-price", "inputmode")) === "decimal", "price inputmode");
    check((await attr(page, "settings-email", "type")) === "email", "email type");
  });

  await runCase("settings-submit", SETTLED, "/settings", async (page, v) => {
    const pending = page.evaluate(
      () =>
        new Promise((resolve) => {
          const status = document.querySelector('[data-testid="settings-status"]');
          const button = document.querySelector('[data-testid="settings-submit"]');
          const obs = new MutationObserver(() => {
            if (status.textContent === "Saving…" && button.disabled && button.textContent === "Saving…") {
              obs.disconnect();
              resolve(true);
            }
          });
          obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
          setTimeout(() => resolve(false), 5000);
        }),
    );
    await page.getByTestId("settings-submit").click();
    check(await pending, "pending UI shown");
    await until(page, "saved", () => {
      const b = document.querySelector('[data-testid="settings-submit"]');
      return document.querySelector('[data-testid="settings-status"]')?.textContent === "Saved Ada Lovelace, total $25.00" && !b.disabled && b.textContent === "Save";
    });
    check(v.settingsRequests.length === 1, `exactly one request, got ${v.settingsRequests.length}`);
    const req = v.settingsRequests[0];
    check(req.method() === "POST", "POST");
    check(req.headers()["content-type"] === "application/json", "content-type json");
    check(req.postData() === JSON.stringify({ name: "Ada Lovelace", email: "ada@example.test", quantity: "2", unitPrice: "12.50" }), `body ${req.postData()}`);
  });

  await runCase("settings-submit-enter", SETTLED, "/settings", async (page, v) => {
    await page.getByTestId("settings-email").click();
    await page.keyboard.press("Enter");
    await until(page, "saved", () => document.querySelector('[data-testid="settings-status"]')?.textContent === "Saved Ada Lovelace, total $25.00");
    check(v.settingsRequests.length === 1, "one request");
  });

  await runCase("settings-submit-error", SETTLED, "/settings", async (page, v) => {
    await replaceText(page, "settings-name", "fail");
    await page.getByTestId("settings-submit").click();
    await until(page, "pending", () => document.querySelector('[data-testid="settings-status"]')?.textContent === "Saving…");
    await until(page, "error", () => {
      const b = document.querySelector('[data-testid="settings-submit"]');
      return (
        document.querySelector('[data-testid="settings-error"]')?.textContent === "The server rejected this display name." &&
        document.querySelector('[data-testid="settings-status"]')?.textContent === "" &&
        !b.disabled &&
        b.textContent === "Save"
      );
    });
    check((await attr(page, "settings-error", "role")) === "alert" && (await page.locator("p.alert[data-testid=settings-error]").count()) === 1, "p.alert role=alert");
    await replaceText(page, "settings-name", "Grace Hopper");
    await page.getByTestId("settings-submit").click();
    await until(page, "error removed on pending", () => !document.querySelector('[data-testid="settings-error"]') && document.querySelector('[data-testid="settings-status"]')?.textContent === "Saving…");
    await until(page, "saved", () => document.querySelector('[data-testid="settings-status"]')?.textContent === "Saved Grace Hopper, total $25.00");
    check(v.settingsRequests.length === 2, "two requests total");
  });

  await runCase("settings-validation", SETTLED, "/settings", async (page, v) => {
    await replaceText(page, "settings-name", "Al");
    await replaceText(page, "settings-email", "nope");
    await page.getByTestId("settings-submit").click();
    await until(page, "errors", () => {
      const nameInput = document.querySelector('[data-testid="settings-name"]');
      const emailInput = document.querySelector('[data-testid="settings-email"]');
      return (
        document.querySelector('[data-testid="settings-name-error"]')?.textContent === "Display name must be at least 3 characters." &&
        document.querySelector('[data-testid="settings-email-error"]')?.textContent === "Enter a valid email address." &&
        nameInput.getAttribute("aria-invalid") === "true" &&
        emailInput.getAttribute("aria-invalid") === "true" &&
        document.activeElement === nameInput
      );
    });
    check((await attr(page, "settings-name", "aria-describedby")) === (await attr(page, "settings-name-error", "id")), "aria-describedby");
    check(!["true"].includes(await attr(page, "settings-quantity", "aria-invalid")), "valid field not invalid");
    await page.waitForTimeout(400);
    check(v.settingsRequests.length === 0, "no request sent");
    await replaceText(page, "settings-name", "Alan");
    await until(page, "name error clears on input", () => !document.querySelector('[data-testid="settings-name-error"]') && document.querySelector('[data-testid="settings-name"]')?.getAttribute("aria-invalid") !== "true");
    check((await text(page, "settings-email-error")) === "Enter a valid email address.", "email error remains");
  });

  await runCase("nav-overview-to-records", EARLY, "/", async (page) => {
    await page.evaluate(() => (window.__noReload = true)).catch(() => {});
    await page.getByTestId("nav-records").click();
    await until(page, "records", () => {
      return (
        location.pathname === "/records" &&
        document.querySelector('[data-testid="page-title"]')?.textContent === "Records" &&
        document.querySelectorAll('[data-testid="record-row"]').length === 200 &&
        document.querySelector('[data-testid="nav-records"]')?.getAttribute("aria-current") === "page"
      );
    });
    check((await page.title()) === "Records | Interaction benchmark", "document.title updates");
    check((await attr(page, "nav-overview", "aria-current")) === null, "overview aria-current removed");
    check(await page.evaluate(() => window.__noReload === true), "client navigation (no document load)");
  });

  await runCase("nav-all-routes", SETTLED, "/", async (page) => {
    await page.evaluate(() => (window.__noReload = true));
    for (const [testid, path, title] of [
      ["nav-settings", "/settings", "Settings"],
      ["nav-records", "/records", "Records"],
      ["nav-overview", "/", "Overview"],
    ]) {
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.getByTestId(testid).click();
      await until(page, title, (t) => document.querySelector('[data-testid="page-title"]')?.textContent === t, title);
      check(new URL(page.url()).pathname === path, `${testid} path`);
      check((await page.title()) === `${title} | Interaction benchmark`, `${testid} title`);
      check((await attr(page, testid, "aria-current")) === "page", `${testid} aria-current`);
      check((await page.evaluate(() => window.scrollY)) === 0, `${testid} lands at top`);
      check(await page.evaluate(() => window.__noReload === true), `${testid} no reload`);
    }
    await page.getByTestId("nav-settings").click();
    await until(page, "settings", () => document.querySelector('[data-testid="page-title"]')?.textContent === "Settings");
    await replaceText(page, "settings-name", "Al");
    await page.getByTestId("settings-submit").click();
    await until(page, "error", () => !!document.querySelector('[data-testid="settings-name-error"]'));
    await page.getByTestId("nav-overview").click();
    await until(page, "overview", () => document.querySelector('[data-testid="page-title"]')?.textContent === "Overview");
    await page.getByTestId("nav-settings").click();
    await until(page, "settings reset", () => document.querySelector('[data-testid="settings-name"]')?.value === "Ada Lovelace" && !document.querySelector(".field-error"));
    check((await text(page, "settings-status")) === "", "status reset");
  });

  await runCase("history-back", SETTLED, "/", async (page) => {
    await page.evaluate(() => (window.__noReload = true));
    await page.getByTestId("nav-records").click();
    await until(page, "records", () => document.querySelectorAll('[data-testid="record-row"]').length === 200);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(100);
    check((await page.evaluate(() => window.scrollY)) === 1200, "scrolled to 1200");
    await page.getByTestId("nav-settings").click();
    await until(page, "settings", () => document.querySelector('[data-testid="page-title"]')?.textContent === "Settings");
    await page.goBack();
    await until(page, "back to records", () => {
      return (
        location.pathname === "/records" &&
        document.querySelector('[data-testid="page-title"]')?.textContent === "Records" &&
        document.querySelectorAll('[data-testid="record-row"]').length === 200 &&
        Math.abs(window.scrollY - 1200) <= 50
      );
    });
    check((await page.title()) === "Records | Interaction benchmark", "title restored");
    check((await attr(page, "nav-records", "aria-current")) === "page", "aria-current restored");
    await page.goForward();
    await until(page, "forward to settings", () => location.pathname === "/settings" && document.querySelector('[data-testid="page-title"]')?.textContent === "Settings");
    await page.goBack();
    await page.goBack();
    await until(page, "back to overview", () => location.pathname === "/" && document.querySelector('[data-testid="page-title"]')?.textContent === "Overview");
    check((await attr(page, "nav-overview", "aria-current")) === "page", "overview aria-current");
    check(await page.evaluate(() => window.__noReload === true), "history traversal stays in document");
  });

  console.log(`\n${results.filter((r) => r.result === "pass").length} passed, ${failed} failed`);
  console.log(failed === 0 ? "CONTRACT SMOKE PASS" : "CONTRACT SMOKE FAIL");
  if (failed) process.exitCode = 1;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
