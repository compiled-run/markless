// Contract correctness smoke for demos/interaction-benchmark/CONTRACT.md; trusted Playwright input, no timing.
import { createRequire } from "node:module";

const repoRequire = createRequire(new URL("../../../../../package.json", import.meta.url));
const { chromium } = repoRequire("@playwright/test");

const base = process.env.BASE_URL ?? "http://localhost:4440";
const expectedBuild = process.env.BENCHMARK_BUILD_ID ?? null;
const TIMEOUT = 5000;
const results = [];

async function waitFor(page, label, predicate, arg) {
  try {
    await page.waitForFunction(predicate, arg, { timeout: TIMEOUT });
  } catch {
    throw new Error(`timed out waiting for ${label}`);
  }
}

const tid = (page, id) => page.getByTestId(id);
const text = (page, id) => tid(page, id).textContent();
const row = (page, id) => page.locator(`[data-testid="record-row"][data-id="${id}"]`);
const selectAll = (page) => page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
const focusedTestId = (page) => page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
const rowIds = (page) =>
  page.$$eval('[data-testid="record-row"]', (rows) => rows.map((r) => r.getAttribute("data-id")));

function eq(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function run(browser, name, path, fn, { early = false, informational = false } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = [];
  page.on("request", (r) => requests.push({ url: r.url(), method: r.method(), type: r.resourceType(), body: r.postData() }));
  try {
    await page.goto(base + path, { waitUntil: early ? "commit" : "load" });
    if (!early) await page.waitForLoadState("networkidle");
    await fn(page, requests);
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, informational, detail: error.message.split("\n")[0] });
    if (!informational) process.exitCode = 1;
  } finally {
    await context.close();
  }
}

async function identity(page) {
  eq("html lang", await page.getAttribute("html", "lang"), "en");
  eq("entrant meta", await page.getAttribute('meta[name="benchmark:entrant"]', "content"), "react-router");
  const build = await page.getAttribute('meta[name="benchmark:build"]', "content");
  if (!build) throw new Error("missing benchmark:build meta");
  if (expectedBuild && build !== expectedBuild) throw new Error(`build ${build} != ${expectedBuild}`);
  eq("viewport", await page.getAttribute('meta[name="viewport"]', "content"), "width=device-width, initial-scale=1");
}

const cases = {
  async "ssr-html"() {
    for (const [path, title] of [["/", "Overview"], ["/records", "Records"], ["/settings", "Settings"]]) {
      const res = await fetch(base + path);
      const html = await res.text();
      eq(`${path} status`, res.status, 200);
      if (!html.includes(`<title>${title} | Interaction benchmark</title>`)) throw new Error(`${path} SSR title`);
      if (!html.includes(`data-testid="page-title">${title}</h1>`)) throw new Error(`${path} SSR page-title`);
      if (!/<meta charSet="utf-8"\/?>/i.test(html)) throw new Error(`${path} charset`);
      if (path === "/records" && (html.match(/data-testid="record-row"/g) ?? []).length !== 200) throw new Error("SSR rows");
    }
  },
  async "api-settings"() {
    const post = (body, headers = { "content-type": "application/json" }) =>
      fetch(base + "/api/settings", { method: "POST", headers, body });
    const start = Date.now();
    let res = await post(JSON.stringify({ name: "Ada Lovelace", email: "ada@example.test", quantity: "2", unitPrice: "12.50" }));
    if (Date.now() - start < 290) throw new Error("no 300 ms delay");
    eq("200 status", res.status, 200);
    eq("content-type", res.headers.get("content-type")?.split(";")[0], "application/json");
    eq("cache-control", res.headers.get("cache-control"), "no-store");
    eq("200 body", await res.json(), { ok: true, message: "Saved Ada Lovelace, total $25.00", savedAt: "2026-01-01T00:00:00.000Z" });
    res = await post(JSON.stringify({ name: " FAIL ", email: "ada@example.test", quantity: "2", unitPrice: "12.50" }));
    eq("422", [res.status, await res.json()], [422, { ok: false, error: "The server rejected this display name." }]);
    res = await post("not json");
    eq("unparseable", [res.status, await res.json()], [400, { ok: false, error: "Invalid settings." }]);
    for (const method of ["GET", "PUT", "DELETE"]) {
      eq(`${method} status`, (await fetch(base + "/api/settings", { method })).status, 405);
    }
  },
};

const browserCases = [
  ["identity-and-layout", "/", async (page) => {
    await identity(page);
    eq("title", await page.title(), "Overview | Interaction benchmark");
    eq("brand", await page.textContent(".app-header .app-brand"), "Interaction benchmark");
    eq("nav label", await page.getAttribute("nav.app-nav", "aria-label"), "Main");
    eq("aria-current overview", await tid(page, "nav-overview").getAttribute("aria-current"), "page");
    eq("aria-current records", await tid(page, "nav-records").getAttribute("aria-current"), null);
    eq("hrefs", await Promise.all(["nav-overview", "nav-records", "nav-settings"].map((id) => tid(page, id).getAttribute("href"))), ["/", "/records", "/settings"]);
    eq("sidebar", await page.getAttribute("aside.sidebar", "aria-label"), "Sections");
    for (const id of ["guides", "advanced", "reference", "plugins"]) {
      const toggle = tid(page, `disclosure-${id}`);
      eq(`${id} expanded`, await toggle.getAttribute("aria-expanded"), "false");
      eq(`${id} controls`, await toggle.getAttribute("aria-controls"), `disclosure-panel-${id}`);
      eq(`${id} hidden`, await tid(page, `disclosure-panel-${id}`).isVisible(), false);
    }
    eq("prose count", await page.locator(".main .prose p").count(), 3);
    eq("panel titles", await page.locator("section.panel h3.panel-title").allTextContents(), ["Counter", "Toggle", "Stepper"]);
    eq("stepper decrement text", await text(page, "stepper-decrement"), "−");
    eq("stepper initial", [await text(page, "stepper-value"), await text(page, "stepper-derived")], ["5", "Squared: 25"]);
    eq("tabs initial", await text(page, "tab-panel"), "Summary: 200 records across 5 teams.");
    eq("filter initial", [await text(page, "filter-count"), await page.getByTestId("filter-item").count()], ["12 items", 12]);
  }],
  ["overview-counter-first:early", "/", async (page) => {
    await tid(page, "counter-increment").click();
    await waitFor(page, "counter 1", () => document.querySelector('[data-testid="counter-value"]')?.textContent === "1");
  }, { early: true }],
  ["overview-counter-first", "/", async (page) => {
    await tid(page, "counter-increment").click();
    await waitFor(page, "counter 1", () => document.querySelector('[data-testid="counter-value"]')?.textContent === "1");
  }],
  ["overview-counter-keyboard", "/", async (page) => {
    await tid(page, "counter-increment").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await waitFor(page, "counter 2", () => document.querySelector('[data-testid="counter-value"]')?.textContent === "2");
  }],
  ...[false, true].map((early) => [`overview-counter-repeat-x10${early ? ":early" : ""}`, "/", async (page) => {
    const button = tid(page, "counter-increment");
    await button.waitFor();
    const box = await button.boundingBox();
    await Promise.all(Array.from({ length: 10 }, () => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)));
    await waitFor(page, "counter 10", () => document.querySelector('[data-testid="counter-value"]')?.textContent === "10");
    await page.waitForTimeout(300);
    eq("counter stays 10", await text(page, "counter-value"), "10");
  }, { early }]),
  ["overview-independent-panel", "/", async (page) => {
    await tid(page, "counter-increment").click();
    await waitFor(page, "counter 1", () => document.querySelector('[data-testid="counter-value"]')?.textContent === "1");
    await tid(page, "stepper-increment").click();
    await waitFor(page, "stepper 6", () => document.querySelector('[data-testid="stepper-value"]')?.textContent === "6");
    eq("state", [await text(page, "stepper-derived"), await text(page, "counter-value"), await text(page, "toggle-status")], ["Squared: 36", "1", "Off"]);
  }],
  ["overview-stepper-bounds", "/", async (page) => {
    for (let i = 0; i < 5; i++) await tid(page, "stepper-increment").click();
    await waitFor(page, "max disabled", () => document.querySelector('[data-testid="stepper-increment"]')?.disabled === true);
    eq("value 10", await text(page, "stepper-value"), "10");
    for (let i = 0; i < 10; i++) await tid(page, "stepper-decrement").click();
    await waitFor(page, "min disabled", () => document.querySelector('[data-testid="stepper-decrement"]')?.disabled === true);
    eq("value 0", [await text(page, "stepper-value"), await text(page, "stepper-derived")], ["0", "Squared: 0"]);
  }],
  ...[false, true].map((early) => [`overview-toggle${early ? ":early" : ""}`, "/", async (page) => {
    await tid(page, "toggle-button").focus();
    await page.keyboard.press("Space");
    await waitFor(page, "toggle on", () => document.querySelector('[data-testid="toggle-button"]')?.getAttribute("aria-pressed") === "true" && document.querySelector('[data-testid="toggle-status"]')?.textContent === "On");
    if (!early) {
      await tid(page, "toggle-button").click();
      await waitFor(page, "toggle off", () => document.querySelector('[data-testid="toggle-status"]')?.textContent === "Off");
    }
  }, { early }]),
  ...[false, true].map((early) => [`overview-disclosure${early ? ":early" : ""}`, "/", async (page) => {
    await tid(page, "disclosure-guides").click();
    await waitFor(page, "guides open", () => document.querySelector('[data-testid="disclosure-guides"]')?.getAttribute("aria-expanded") === "true");
    eq("leaf visible", await tid(page, "tree-leaf-getting-started").isVisible(), true);
  }, { early }]),
  ["overview-disclosure-nested", "/", async (page) => {
    await tid(page, "disclosure-guides").click();
    await waitFor(page, "guides open", () => document.querySelector('[data-testid="disclosure-guides"]')?.getAttribute("aria-expanded") === "true");
    await tid(page, "disclosure-advanced").click();
    await waitFor(page, "advanced open", () => document.querySelector('[data-testid="disclosure-advanced"]')?.getAttribute("aria-expanded") === "true");
    eq("leaves visible", [await tid(page, "tree-leaf-caching").isVisible(), await tid(page, "tree-leaf-streaming").isVisible()], [true, true]);
    await tid(page, "disclosure-guides").click();
    await tid(page, "disclosure-guides").focus();
    await page.keyboard.press("Enter");
    await waitFor(page, "guides reopened", () => document.querySelector('[data-testid="disclosure-guides"]')?.getAttribute("aria-expanded") === "true");
    eq("nested kept", await tid(page, "disclosure-advanced").getAttribute("aria-expanded"), "true");
    eq("caching still visible", await tid(page, "tree-leaf-caching").isVisible(), true);
  }],
  ...[false, true].map((early) => [`overview-tab${early ? ":early" : ""}`, "/", async (page) => {
    await tid(page, "tab-activity").click();
    await waitFor(page, "activity", () => document.querySelector('[data-testid="tab-panel"]')?.textContent === "Activity: 12 updates in the last 24 hours.");
    eq("selected", [await tid(page, "tab-activity").getAttribute("aria-selected"), await tid(page, "tab-summary").getAttribute("aria-selected")], ["true", "false"]);
    eq("tabindex", [await tid(page, "tab-activity").getAttribute("tabindex"), await tid(page, "tab-summary").getAttribute("tabindex")], ["0", "-1"]);
    eq("labelledby", await tid(page, "tab-panel").getAttribute("aria-labelledby"), "tab-activity");
  }, { early }]),
  ["overview-tab-keyboard", "/", async (page) => {
    await tid(page, "tab-summary").focus();
    await page.keyboard.press("ArrowRight");
    eq("right", [await focusedTestId(page), await text(page, "tab-panel")], ["tab-activity", "Activity: 12 updates in the last 24 hours."]);
    await page.keyboard.press("End");
    eq("end", [await focusedTestId(page), await text(page, "tab-panel")], ["tab-notes", "Notes: No open issues."]);
    await page.keyboard.press("ArrowRight");
    eq("wrap right", await focusedTestId(page), "tab-summary");
    await page.keyboard.press("ArrowLeft");
    eq("wrap left", await focusedTestId(page), "tab-notes");
    await page.keyboard.press("Home");
    eq("home", [await focusedTestId(page), await tid(page, "tab-summary").getAttribute("aria-selected")], ["tab-summary", "true"]);
    await tid(page, "tab-notes").focus();
    await page.keyboard.press("Space");
    eq("space selects", await text(page, "tab-panel"), "Notes: No open issues.");
  }],
  ...[false, true].map((early) => [`overview-filter${early ? ":early" : ""}`, "/", async (page) => {
    await tid(page, "filter-input").click();
    await page.keyboard.insertText("berry");
    await waitFor(page, "2 items", () => document.querySelector('[data-testid="filter-count"]')?.textContent === "2 items");
    eq("items", await page.getByTestId("filter-item").allTextContents(), ["Blueberry", "Elderberry"]);
    eq("no empty", await tid(page, "filter-empty").count(), 0);
    if (!early) {
      await page.keyboard.insertText("zzz");
      await waitFor(page, "empty", () => document.querySelector('[data-testid="filter-empty"]')?.textContent === "No matching items");
      eq("empty count", [await text(page, "filter-count"), await page.getByTestId("filter-item").count()], ["0 items", 0]);
    }
  }, { early }]),
  ...[false, true].map((early) => [`records-search${early ? ":early" : ""}`, "/records", async (page) => {
    await tid(page, "records-search").click();
    await page.keyboard.insertText("knuth");
    await waitFor(page, "15 rows", () => document.querySelector('[data-testid="records-count"]')?.textContent === "Showing 15 of 200");
    const ids = await rowIds(page);
    eq("rows", [ids.length, ids[0]], [15, "r016"]);
    if (!early) {
      await page.keyboard.insertText("zzzz");
      await waitFor(page, "empty", () => document.querySelector('[data-testid="records-empty"]')?.textContent === "No records match");
      eq("colspan", await tid(page, "records-empty").getAttribute("colspan"), "7");
    }
  }, { early }]),
  ...[false, true].map((early) => [`records-sort${early ? ":early" : ""}`, "/records", async (page) => {
    await tid(page, "sort-score").click();
    await waitFor(page, "ascending", () => document.querySelector('[data-testid="sort-score"]')?.closest("th")?.getAttribute("aria-sort") === "ascending");
    const ids = await rowIds(page);
    eq("first/last", [ids[0], ids.at(-1)], ["r004", "r147"]);
    eq("name aria-sort", await page.locator("th", { has: tid(page, "sort-name") }).getAttribute("aria-sort"), "none");
  }, { early }]),
  ["records-sort-toggle", "/records", async (page) => {
    const nameTh = page.locator("th", { has: tid(page, "sort-name") });
    const scoreTh = page.locator("th", { has: tid(page, "sort-score") });
    eq("initial aria-sort", [await nameTh.getAttribute("aria-sort"), await scoreTh.getAttribute("aria-sort")], ["none", "none"]);
    eq("initial order", (await rowIds(page))[0], "r001");
    await tid(page, "sort-score").click();
    await waitFor(page, "ascending", () => document.querySelector('[data-testid="record-row"]')?.getAttribute("data-id") === "r004");
    await tid(page, "sort-score").click();
    await waitFor(page, "descending", () => document.querySelector('[data-testid="record-row"]')?.getAttribute("data-id") === "r147");
    eq("desc aria-sort", await scoreTh.getAttribute("aria-sort"), "descending");
    await tid(page, "sort-name").click();
    await waitFor(page, "name asc", () => document.querySelector('[data-testid="record-row"]')?.getAttribute("data-id") === "r028");
    eq("name first", await row(page, "r028").getByTestId("record-name").textContent(), "Ada Engelbart");
    eq("aria-sort swap", [await nameTh.getAttribute("aria-sort"), await scoreTh.getAttribute("aria-sort")], ["ascending", "none"]);
  }],
  ...[false, true].map((early) => [`records-select${early ? ":early" : ""}`, "/records", async (page) => {
    await row(page, "r003").getByTestId("record-select").click();
    await waitFor(page, "1 selected", () => document.querySelector('[data-testid="selection-summary"]')?.textContent === "1 selected");
    eq("checked", await row(page, "r003").getByTestId("record-select").isChecked(), true);
    if (!early) {
      const node = await row(page, "r016").elementHandle();
      await tid(page, "records-search").click();
      await page.keyboard.insertText("knuth");
      await waitFor(page, "filtered", () => document.querySelector('[data-testid="records-count"]')?.textContent === "Showing 15 of 200");
      eq("hidden selection counted", await text(page, "selection-summary"), "1 selected");
      await selectAll(page);
      await page.keyboard.press("Backspace");
      await waitFor(page, "all rows", () => document.querySelectorAll('[data-testid="record-row"]').length === 200);
      eq("row identity kept", await node.evaluate((el) => el.isConnected), true);
      eq("still checked", await row(page, "r003").getByTestId("record-select").isChecked(), true);
      await row(page, "r003").getByTestId("record-select").focus();
      await page.keyboard.press("Space");
      await waitFor(page, "0 selected", () => document.querySelector('[data-testid="selection-summary"]')?.textContent === "0 selected");
    }
  }, { early }]),
  ...[false, true].map((early) => [`records-dialog-open${early ? ":early" : ""}`, "/records", async (page) => {
    await row(page, "r001").getByTestId("record-edit").click();
    await tid(page, "edit-dialog").waitFor({ state: "visible", timeout: TIMEOUT });
    eq("name value", await tid(page, "edit-name").inputValue(), "Katherine Hopper");
    eq("focus", await focusedTestId(page), "edit-name");
    eq("title", await text(page, "edit-dialog-title"), "Edit record");
    eq("labelledby", await tid(page, "edit-dialog").getAttribute("aria-labelledby"), await tid(page, "edit-dialog-title").getAttribute("id"));
  }, { early }]),
  ["records-dialog-save", "/records", async (page) => {
    await row(page, "r003").getByTestId("record-select").click();
    await waitFor(page, "1 selected", () => document.querySelector('[data-testid="selection-summary"]')?.textContent === "1 selected");
    await row(page, "r001").getByTestId("record-edit").click();
    await tid(page, "edit-dialog").waitFor({ state: "visible", timeout: TIMEOUT });
    await selectAll(page);
    await page.keyboard.insertText("Renamed Record");
    await tid(page, "edit-save").click();
    await tid(page, "edit-dialog").waitFor({ state: "hidden", timeout: TIMEOUT });
    eq("name", await row(page, "r001").getByTestId("record-name").textContent(), "Renamed Record");
    eq("aria-label", await row(page, "r001").getByTestId("record-edit").getAttribute("aria-label"), "Edit Renamed Record");
    eq("summary", await text(page, "selection-summary"), "1 selected");
    await waitFor(page, "focus on r001 edit", () => document.activeElement?.closest('[data-testid="record-row"]')?.getAttribute("data-id") === "r001" && document.activeElement.getAttribute("data-testid") === "record-edit");
  }],
  ["records-dialog-save-resort-and-validation", "/records", async (page) => {
    await tid(page, "sort-name").click();
    await waitFor(page, "name asc", () => document.querySelector('[data-testid="record-row"]')?.getAttribute("data-id") === "r028");
    await row(page, "r001").getByTestId("record-edit").click();
    await tid(page, "edit-dialog").waitFor({ state: "visible", timeout: TIMEOUT });
    await selectAll(page);
    await page.keyboard.insertText("   ");
    eq("save disabled", await tid(page, "edit-save").isDisabled(), true);
    await selectAll(page);
    await page.keyboard.insertText("  Aaa First  ");
    await page.keyboard.press("Enter");
    await tid(page, "edit-dialog").waitFor({ state: "hidden", timeout: TIMEOUT });
    eq("resorted first", (await rowIds(page))[0], "r001");
    eq("trimmed", await row(page, "r001").getByTestId("record-name").textContent(), "Aaa First");
    await waitFor(page, "focus on r001 edit", () => document.activeElement?.closest('[data-testid="record-row"]')?.getAttribute("data-id") === "r001");
    eq("one dialog", await page.locator('[data-testid="edit-dialog"]').count() <= 1, true);
  }],
  ["records-dialog-cancel", "/records", async (page) => {
    await row(page, "r002").getByTestId("record-edit").click();
    await tid(page, "edit-dialog").waitFor({ state: "visible", timeout: TIMEOUT });
    await page.keyboard.insertText("changed");
    await page.keyboard.press("Escape");
    await tid(page, "edit-dialog").waitFor({ state: "hidden", timeout: TIMEOUT });
    eq("unchanged", await row(page, "r002").getByTestId("record-name").textContent(), "Hedy Floyd");
    await waitFor(page, "focus on r002 edit", () => document.activeElement?.closest('[data-testid="record-row"]')?.getAttribute("data-id") === "r002" && document.activeElement.getAttribute("data-testid") === "record-edit");
    await row(page, "r002").getByTestId("record-edit").click();
    await tid(page, "edit-dialog").waitFor({ state: "visible", timeout: TIMEOUT });
    await tid(page, "edit-cancel").click();
    await tid(page, "edit-dialog").waitFor({ state: "hidden", timeout: TIMEOUT });
    await waitFor(page, "focus after cancel button", () => document.activeElement?.closest('[data-testid="record-row"]')?.getAttribute("data-id") === "r002");
  }],
  ...[false, true].map((early) => [`settings-derived${early ? ":early" : ""}`, "/settings", async (page) => {
    await tid(page, "settings-quantity").click();
    await selectAll(page);
    await page.keyboard.insertText("3");
    await waitFor(page, "total 37.50", () => document.querySelector('[data-testid="settings-total"]')?.textContent === "Total: $37.50");
    if (!early) {
      await selectAll(page);
      await page.keyboard.insertText("x");
      await waitFor(page, "n/a", () => document.querySelector('[data-testid="settings-total"]')?.textContent === "Total: n/a");
      eq("no errors before submit", await page.locator(".field-error").count(), 0);
    }
  }, { early }]),
  ["settings-submit", "/settings", async (page, requests) => {
    eq("initial", [await text(page, "settings-total"), await text(page, "settings-status"), await text(page, "settings-submit")], ["Total: $25.00", "", "Save"]);
    const before = requests.length;
    await tid(page, "settings-submit").click();
    eq("pending", [await text(page, "settings-status"), await tid(page, "settings-submit").isDisabled(), await text(page, "settings-submit")], ["Saving…", true, "Saving…"]);
    await waitFor(page, "saved", () => document.querySelector('[data-testid="settings-status"]')?.textContent === "Saved Ada Lovelace, total $25.00");
    eq("enabled", [await tid(page, "settings-submit").isDisabled(), await text(page, "settings-submit")], [false, "Save"]);
    await page.waitForTimeout(500);
    const after = requests.slice(before).filter((r) => r.type === "fetch" || r.type === "xhr" || r.type === "document");
    eq("one request", after.map((r) => `${r.method} ${new URL(r.url).pathname}`), ["POST /api/settings"]);
    eq("body", JSON.parse(after[0].body), { name: "Ada Lovelace", email: "ada@example.test", quantity: "2", unitPrice: "12.50" });
    await tid(page, "settings-quantity").click();
    await selectAll(page);
    await page.keyboard.insertText("3");
    await page.keyboard.press("Enter");
    await waitFor(page, "enter submits", () => document.querySelector('[data-testid="settings-status"]')?.textContent === "Saved Ada Lovelace, total $37.50");
  }],
  ["settings-submit-error", "/settings", async (page, requests) => {
    await tid(page, "settings-name").click();
    await selectAll(page);
    await page.keyboard.insertText("fail");
    const before = requests.length;
    await tid(page, "settings-submit").click();
    eq("pending", [await text(page, "settings-status"), await tid(page, "settings-submit").isDisabled()], ["Saving…", true]);
    await waitFor(page, "error", () => document.querySelector('[data-testid="settings-error"]')?.textContent === "The server rejected this display name.");
    eq("after", [await text(page, "settings-status"), await tid(page, "settings-submit").isDisabled(), await text(page, "settings-submit"), await tid(page, "settings-error").getAttribute("role")], ["", false, "Save", "alert"]);
    await tid(page, "settings-submit").click();
    eq("error cleared while pending", await tid(page, "settings-error").count(), 0);
    await waitFor(page, "error again", () => document.querySelector('[data-testid="settings-error"]') !== null);
    eq("two requests", requests.slice(before).filter((r) => r.type === "fetch").length, 2);
  }],
  ["settings-validation", "/settings", async (page, requests) => {
    await tid(page, "settings-name").click();
    await selectAll(page);
    await page.keyboard.insertText("Al");
    await tid(page, "settings-email").click();
    await selectAll(page);
    await page.keyboard.insertText("nope");
    eq("no errors yet", await page.locator(".field-error").count(), 0);
    const before = requests.length;
    await tid(page, "settings-submit").click();
    await waitFor(page, "errors", () => document.querySelector('[data-testid="settings-name-error"]') !== null);
    eq("messages", [await text(page, "settings-name-error"), await text(page, "settings-email-error")], ["Display name must be at least 3 characters.", "Enter a valid email address."]);
    eq("invalid", [await tid(page, "settings-name").getAttribute("aria-invalid"), await tid(page, "settings-email").getAttribute("aria-invalid"), await tid(page, "settings-quantity").getAttribute("aria-invalid")], ["true", "true", null]);
    eq("describedby", await tid(page, "settings-name").getAttribute("aria-describedby"), await tid(page, "settings-name-error").getAttribute("id"));
    eq("focus", await focusedTestId(page), "settings-name");
    await page.waitForTimeout(400);
    eq("no request", requests.slice(before).filter((r) => r.url.includes("/api/settings")).length, 0);
    await page.keyboard.insertText("an");
    await waitFor(page, "name error cleared live", () => document.querySelector('[data-testid="settings-name-error"]') === null);
    eq("name valid", await tid(page, "settings-name").getAttribute("aria-invalid"), null);
  }],
  ...[false, true].map((early) => [`nav-overview-to-records${early ? ":early" : ""}`, "/", async (page, requests) => {
    await tid(page, "nav-records").waitFor();
    if (!early) await page.evaluate(() => { window.__sameDocument = true; });
    const before = requests.length;
    await tid(page, "nav-records").click();
    await page.waitForURL(base + "/records");
    await waitFor(page, "records", () => document.querySelectorAll('[data-testid="record-row"]').length === 200 && document.querySelector('[data-testid="page-title"]')?.textContent === "Records");
    eq("aria-current", [await tid(page, "nav-records").getAttribute("aria-current"), await tid(page, "nav-overview").getAttribute("aria-current")], ["page", null]);
    eq("document.title", await page.title(), "Records | Interaction benchmark");
    if (!early) {
      eq("same document", await page.evaluate(() => window.__sameDocument), true);
      eq("no document request", requests.slice(before).filter((r) => r.type === "document").length, 0);
    }
  }, { early }]),
  ["nav-all-routes-and-scroll-top", "/", async (page) => {
    await page.evaluate(() => { window.__sameDocument = true; });
    for (const [id, path, title] of [["nav-settings", "/settings", "Settings"], ["nav-records", "/records", "Records"], ["nav-overview", "/", "Overview"]]) {
      await page.evaluate(() => window.scrollTo(0, 400));
      await tid(page, id).click();
      await page.waitForURL(base + path);
      await waitFor(page, title, (t) => document.querySelector('[data-testid="page-title"]')?.textContent === t, title);
      eq(`${path} title`, await page.title(), `${title} | Interaction benchmark`);
      eq(`${path} current`, await tid(page, id).getAttribute("aria-current"), "page");
      eq(`${path} scrollY`, await page.evaluate(() => window.scrollY), 0);
    }
    eq("same document", await page.evaluate(() => window.__sameDocument), true);
  }],
  ...[
    ["history-back", "dispatch"],
    ["history-back:literal-playwright-click", "click"],
  ].map(([name, leave]) => [name, "/", async (page) => {
    await tid(page, "nav-records").click();
    await waitFor(page, "records", () => document.querySelectorAll('[data-testid="record-row"]').length === 200);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await waitFor(page, "scrolled", () => Math.abs(window.scrollY - 1200) <= 50);
    // A trusted click scrolls the non-sticky header link into view first, so the route is left at y=0.
    if (leave === "click") await tid(page, "nav-settings").click();
    else await tid(page, "nav-settings").dispatchEvent("click");
    await waitFor(page, "settings", () => document.querySelector('[data-testid="page-title"]')?.textContent === "Settings");
    eq("forward lands at top", await page.evaluate(() => window.scrollY), 0);
    await page.goBack();
    await waitFor(page, "records back", () => location.pathname === "/records" && document.querySelector('[data-testid="page-title"]')?.textContent === "Records" && document.querySelectorAll('[data-testid="record-row"]').length === 200);
    await waitFor(page, "scroll restored to 1200", () => Math.abs(window.scrollY - 1200) <= 50);
    eq("title", await page.title(), "Records | Interaction benchmark");
    eq("current", await tid(page, "nav-records").getAttribute("aria-current"), "page");
    await page.goForward();
    await waitFor(page, "settings forward", () => location.pathname === "/settings" && document.querySelector('[data-testid="page-title"]')?.textContent === "Settings");
    eq("forward title", await page.title(), "Settings | Interaction benchmark");
  }, { informational: leave === "click" }]),
];

for (const [name, fn] of Object.entries(cases)) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    process.exitCode = 1;
  }
}

const browser = await chromium.launch();
try {
  for (const [name, path, fn, options] of browserCases) await run(browser, name, path, fn, options);
} finally {
  await browser.close();
}

for (const r of results) console.log(`${r.ok ? "PASS" : r.informational ? "INFO-FAIL" : "FAIL"} ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
