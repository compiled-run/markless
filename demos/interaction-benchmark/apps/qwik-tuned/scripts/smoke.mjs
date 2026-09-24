// Contract correctness smoke for the Qwik entrant: every case in demos/interaction-benchmark/CONTRACT.md sections 10 and 1-8, trusted Playwright input, no timing.
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";

const repoRoot = new URL("../../../../../", import.meta.url);
// Playwright lives in the root workspace only as a peer of @vitest/browser-playwright.
const requireFromRoot = createRequire(
  realpathSync(fileURLToPath(new URL("node_modules/@vitest/browser-playwright/package.json", repoRoot))),
);
const { chromium } = requireFromRoot("playwright");

const base = process.env.BASE_URL ?? "http://localhost:4425";
const expectedBuild = process.env.BENCHMARK_BUILD_ID;
const url = (path) => new URL(path, base).href;
const TIMEOUT = 5000;
const selectAll = process.platform === "darwin" ? "Meta+A" : "Control+A";

const passed = [];
const failed = [];
const only = process.env.ONLY;

const browser = await chromium.launch();

async function run(name, fn) {
  if (only && !name.includes(only)) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  try {
    await fn(page, context);
    assert.deepEqual(pageErrors.map(String), [], "page errors");
    passed.push(name);
    console.log(`ok - ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`not ok - ${name}\n  ${String(error?.stack ?? error).split("\n").slice(0, 6).join("\n  ")}`);
  } finally {
    await context.close();
  }
}

const byId = (page, id) => page.getByTestId(id);
const row = (page, id) => page.locator(`[data-testid="record-row"][data-id="${id}"]`);

async function waitFor(page, predicate, arg, message) {
  try {
    await page.waitForFunction(predicate, arg, { timeout: TIMEOUT, polling: "raf" });
  } catch {
    throw new Error(`timed out waiting for: ${message}`);
  }
}

const textIs = (page, testid, text) =>
  waitFor(
    page,
    ([id, expected]) => document.querySelector(`[data-testid="${id}"]`)?.textContent === expected,
    [testid, text],
    `${testid} text = ${JSON.stringify(text)}`,
  );

const attrIs = (page, selector, name, value) =>
  waitFor(
    page,
    ([sel, attr, expected]) => document.querySelector(sel)?.getAttribute(attr) === expected,
    [selector, name, value],
    `${selector}[${name}] = ${JSON.stringify(value)}`,
  );

const tid = (id) => `[data-testid="${id}"]`;

async function text(page, testid) {
  return page.locator(tid(testid)).first().textContent();
}

async function goto(page, path, phase) {
  await page.goto(url(path), { waitUntil: phase === "early" ? "commit" : "load" });
  if (phase === "settled") await page.waitForLoadState("networkidle");
}

async function rowIds(page) {
  return page.locator('[data-testid="record-row"]').evaluateAll((rows) => rows.map((r) => r.dataset.id));
}

async function focusedTestId(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    const row = el?.closest("[data-testid=record-row]");
    return { testid: el?.getAttribute("data-testid") ?? null, id: el?.id ?? null, row: row?.getAttribute("data-id") ?? null };
  });
}

function trackSettingsRequests(page) {
  const requests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/settings") requests.push(request);
  });
  return requests;
}

const PHASES = ["early", "settled"];
const ROUTE_EXPECT = [
  ["/", "Overview", "nav-overview"],
  ["/records", "Records", "nav-records"],
  ["/settings", "Settings", "nav-settings"],
];

// ---- Document basics, identity, layout ----

for (const [path, title, nav] of ROUTE_EXPECT) {
  await run(`document basics + identity + layout on ${path}`, async (page) => {
    const response = await fetch(url(path));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<html[^>]* lang="en"/);
    assert.match(html, new RegExp(`data-testid="page-title"[^>]*>${title}</h1>`));
    await goto(page, path, "settled");
    assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
    assert.equal(await page.evaluate(() => document.characterSet), "UTF-8");
    assert.ok(await page.locator('meta[charset="utf-8"]').count());
    assert.equal(
      await page.locator('meta[name="viewport"]').getAttribute("content"),
      "width=device-width, initial-scale=1",
    );
    assert.equal(await page.locator('meta[name="benchmark:entrant"]').getAttribute("content"), "qwik");
    const build = await page.locator('meta[name="benchmark:build"]').getAttribute("content");
    assert.ok(build && build.length > 0, "benchmark:build present");
    if (expectedBuild) assert.equal(build, expectedBuild);
    assert.equal(await page.title(), `${title} | Interaction benchmark`);
    assert.equal(await text(page, "page-title"), title);
    assert.equal(await page.locator("div.app > header.app-header > span.app-brand").textContent(), "Interaction benchmark");
    const links = await page.locator('nav.app-nav[aria-label="Main"] a').evaluateAll((as) =>
      as.map((a) => [a.dataset.testid, a.getAttribute("href"), a.textContent, a.getAttribute("aria-current")]),
    );
    assert.deepEqual(
      links,
      ROUTE_EXPECT.map(([p, t, n]) => [n, p, t, n === nav ? "page" : null]),
    );
    assert.ok(await page.locator('div.app-body > aside.sidebar[aria-label="Sections"] > ul.tree').count());
    assert.ok(await page.locator('div.app-body > main.main > h1.page-title[data-testid="page-title"]').count());
    for (const id of ["guides", "advanced", "reference", "plugins"]) {
      const toggle = page.locator(`button.tree-toggle${tid(`disclosure-${id}`)}`);
      assert.equal(await toggle.getAttribute("type"), "button");
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      assert.equal(await toggle.getAttribute("aria-controls"), `disclosure-panel-${id}`);
      const panel = page.locator(`ul.tree-panel#disclosure-panel-${id}${tid(`disclosure-panel-${id}`)}`);
      assert.equal(await panel.count(), 1);
      assert.equal(await panel.isVisible(), false);
    }
    for (const leaf of ["getting-started", "caching", "streaming", "api", "bundler", "router"]) {
      assert.equal(await page.locator(`li > span.tree-leaf${tid(`tree-leaf-${leaf}`)}`).count(), 1);
    }
  });
}

await run("overview static structure", async (page) => {
  await goto(page, "/", "settled");
  assert.equal(await page.locator("div.prose > p").count(), 3);
  assert.equal(await page.locator("h2.section-title").textContent(), "Panels");
  assert.deepEqual(await page.locator("div.panels > section.panel > h3.panel-title").allTextContents(), [
    "Counter",
    "Toggle",
    "Stepper",
  ]);
  assert.equal(await page.locator(`output.value${tid("counter-value")}`).textContent(), "0");
  assert.equal(await page.locator(`button.button${tid("counter-increment")}[type=button]`).textContent(), "Increment");
  assert.equal(await page.locator(`button.button${tid("toggle-button")}`).getAttribute("aria-pressed"), "false");
  assert.equal(await text(page, "toggle-status"), "Off");
  assert.equal(await page.locator(`div.row > button${tid("stepper-decrement")}[aria-label=Decrease]`).textContent(), "−");
  assert.equal(await page.locator(`div.row > button${tid("stepper-increment")}[aria-label=Increase]`).textContent(), "+");
  assert.equal(await page.locator(`div.row > output.value${tid("stepper-value")}`).textContent(), "5");
  assert.equal(await page.locator(`p.derived${tid("stepper-derived")}`).textContent(), "Squared: 25");
  const tablist = page.locator(`div.tabs > div.tablist[role=tablist][aria-label=Details]${tid("overview-tabs")}`);
  assert.equal(await tablist.count(), 1);
  const tabs = await page.locator("button.tab").evaluateAll((els) =>
    els.map((e) => [e.type, e.getAttribute("role"), e.id, e.dataset.testid, e.getAttribute("aria-controls"), e.textContent, e.getAttribute("aria-selected"), e.getAttribute("tabindex")]),
  );
  assert.deepEqual(tabs, [
    ["button", "tab", "tab-summary", "tab-summary", "tab-panel", "Summary", "true", "0"],
    ["button", "tab", "tab-activity", "tab-activity", "tab-panel", "Activity", "false", "-1"],
    ["button", "tab", "tab-notes", "tab-notes", "tab-panel", "Notes", "false", "-1"],
  ]);
  const panel = page.locator(`div.tabpanel[role=tabpanel]#tab-panel${tid("tab-panel")}`);
  assert.equal(await panel.getAttribute("aria-labelledby"), "tab-summary");
  assert.equal(await panel.getAttribute("tabindex"), "0");
  assert.equal(await panel.textContent(), "Summary: 200 records across 5 teams.");
  const input = page.locator(`section.filter > div.field > input.input[type=search]${tid("filter-input")}`);
  assert.equal(await input.getAttribute("autocomplete"), "off");
  assert.equal(await input.inputValue(), "");
  const inputId = await input.getAttribute("id");
  assert.equal(await page.locator(`label.field-label[for="${inputId}"]`).textContent(), "Filter items");
  assert.equal(await page.locator(`p.muted${tid("filter-count")}`).textContent(), "12 items");
  assert.equal(await page.locator(`ul.list${tid("filter-list")} > li${tid("filter-item")}`).count(), 12);
  assert.equal(await byId(page, "filter-empty").count(), 0);
});

// ---- Measured and correctness-only cases (CONTRACT.md section 10) ----

for (const phase of PHASES) {
  await run(`overview-counter-first [${phase}]`, async (page) => {
    await goto(page, "/", phase);
    await byId(page, "counter-increment").click();
    await textIs(page, "counter-value", "1");
  });

  await run(`overview-counter-repeat-x10 [${phase}]`, async (page) => {
    await goto(page, "/", phase);
    const button = byId(page, "counter-increment");
    await button.waitFor({ state: "visible" });
    const box = await button.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await Promise.all(Array.from({ length: 10 }, () => page.mouse.click(x, y)));
    await textIs(page, "counter-value", "10");
    await page.waitForTimeout(300);
    assert.equal(await text(page, "counter-value"), "10");
  });

  await run(`overview-toggle [${phase}]`, async (page) => {
    await goto(page, "/", phase);
    await byId(page, "toggle-button").focus();
    await page.keyboard.press("Space");
    await attrIs(page, tid("toggle-button"), "aria-pressed", "true");
    await textIs(page, "toggle-status", "On");
  });

  await run(`overview-disclosure [${phase}]`, async (page) => {
    await goto(page, "/", phase);
    await byId(page, "disclosure-guides").click();
    await attrIs(page, tid("disclosure-guides"), "aria-expanded", "true");
    await byId(page, "tree-leaf-getting-started").waitFor({ state: "visible", timeout: TIMEOUT });
  });

  await run(`overview-tab [${phase}]`, async (page) => {
    await goto(page, "/", phase);
    await byId(page, "tab-activity").click();
    await attrIs(page, tid("tab-activity"), "aria-selected", "true");
    await attrIs(page, tid("tab-summary"), "aria-selected", "false");
    await textIs(page, "tab-panel", "Activity: 12 updates in the last 24 hours.");
  });

  await run(`overview-filter [${phase}]`, async (page) => {
    await goto(page, "/", phase);
    await byId(page, "filter-input").click();
    await page.keyboard.insertText("berry");
    await textIs(page, "filter-count", "2 items");
    assert.deepEqual(await page.getByTestId("filter-item").allTextContents(), ["Blueberry", "Elderberry"]);
  });

  await run(`records-search [${phase}]`, async (page) => {
    await goto(page, "/records", phase);
    await byId(page, "records-search").click();
    await page.keyboard.insertText("knuth");
    await textIs(page, "records-count", "Showing 15 of 200");
    const ids = await rowIds(page);
    assert.equal(ids.length, 15);
    assert.equal(ids[0], "r016");
  });

  await run(`records-sort [${phase}]`, async (page) => {
    await goto(page, "/records", phase);
    await byId(page, "sort-score").click();
    await waitFor(
      page,
      () => document.querySelector('[data-testid="record-row"]')?.getAttribute("data-id") === "r004",
      undefined,
      "first row r004",
    );
    assert.equal(await page.locator("th", { has: byId(page, "sort-score") }).getAttribute("aria-sort"), "ascending");
    assert.equal(await page.locator("th", { has: byId(page, "sort-name") }).getAttribute("aria-sort"), "none");
    const ids = await rowIds(page);
    assert.equal(ids.length, 200);
    assert.equal(ids.at(-1), "r147");
  });

  await run(`records-select [${phase}]`, async (page) => {
    await goto(page, "/records", phase);
    await row(page, "r003").getByTestId("record-select").click();
    await textIs(page, "selection-summary", "1 selected");
    assert.equal(await row(page, "r003").getByTestId("record-select").isChecked(), true);
  });

  await run(`records-dialog-open [${phase}]`, async (page) => {
    await goto(page, "/records", phase);
    await row(page, "r001").getByTestId("record-edit").click();
    await byId(page, "edit-dialog").waitFor({ state: "visible", timeout: TIMEOUT });
    await waitFor(
      page,
      () => {
        const input = document.querySelector('[data-testid="edit-name"]');
        return input?.value === "Katherine Hopper" && document.activeElement === input;
      },
      undefined,
      "edit-name value Katherine Hopper and focused",
    );
  });

  await run(`settings-derived [${phase}]`, async (page) => {
    await goto(page, "/settings", phase);
    await byId(page, "settings-quantity").click();
    await page.keyboard.press(selectAll);
    await page.keyboard.insertText("3");
    await textIs(page, "settings-total", "Total: $37.50");
  });

  await run(`nav-overview-to-records [${phase}]`, async (page) => {
    await goto(page, "/", phase);
    if (phase === "settled") await page.evaluate(() => (window.__benchMarker = "same-document"));
    const documents = [];
    page.on("request", (r) => r.resourceType() === "document" && documents.push(r.url()));
    await byId(page, "nav-records").click();
    await page.waitForURL((u) => u.pathname === "/records", { timeout: TIMEOUT });
    await textIs(page, "page-title", "Records");
    await waitFor(page, () => document.querySelectorAll('[data-testid="record-row"]').length === 200, undefined, "200 rows");
    await attrIs(page, tid("nav-records"), "aria-current", "page");
    assert.equal(await byId(page, "nav-overview").getAttribute("aria-current"), null);
    await waitFor(page, () => document.title === "Records | Interaction benchmark", undefined, "document.title");
    if (phase === "settled") {
      assert.deepEqual(documents, [], "no document request on client navigation");
      assert.equal(await page.evaluate(() => window.__benchMarker), "same-document");
    }
  });
}

await run("overview-counter keyboard Enter and Space", async (page) => {
  await goto(page, "/", "settled");
  await byId(page, "counter-increment").focus();
  await page.keyboard.press("Enter");
  await textIs(page, "counter-value", "1");
  await page.keyboard.press("Space");
  await textIs(page, "counter-value", "2");
});

await run("overview-independent-panel", async (page) => {
  await goto(page, "/", "settled");
  await byId(page, "counter-increment").click();
  await textIs(page, "counter-value", "1");
  await byId(page, "stepper-increment").click();
  await textIs(page, "stepper-value", "6");
  await textIs(page, "stepper-derived", "Squared: 36");
  assert.equal(await text(page, "counter-value"), "1");
  assert.equal(await text(page, "toggle-status"), "Off");
  assert.equal(await byId(page, "toggle-button").getAttribute("aria-pressed"), "false");
});

await run("overview stepper bounds disable", async (page) => {
  await goto(page, "/", "settled");
  for (let i = 0; i < 5; i++) await byId(page, "stepper-increment").click();
  await textIs(page, "stepper-value", "10");
  await waitFor(page, () => document.querySelector('[data-testid="stepper-increment"]').disabled, undefined, "increment disabled at 10");
  for (let i = 0; i < 10; i++) await byId(page, "stepper-decrement").click();
  await textIs(page, "stepper-value", "0");
  await waitFor(page, () => document.querySelector('[data-testid="stepper-decrement"]').disabled, undefined, "decrement disabled at 0");
  await textIs(page, "stepper-derived", "Squared: 0");
});

await run("overview toggle click flips back", async (page) => {
  await goto(page, "/", "settled");
  await byId(page, "toggle-button").click();
  await textIs(page, "toggle-status", "On");
  await byId(page, "toggle-button").click();
  await textIs(page, "toggle-status", "Off");
  await attrIs(page, tid("toggle-button"), "aria-pressed", "false");
});

await run("overview-disclosure-nested (+ nested state survives parent collapse, keyboard)", async (page) => {
  await goto(page, "/", "settled");
  await byId(page, "disclosure-guides").click();
  await attrIs(page, tid("disclosure-guides"), "aria-expanded", "true");
  await byId(page, "disclosure-advanced").click();
  await attrIs(page, tid("disclosure-advanced"), "aria-expanded", "true");
  await byId(page, "tree-leaf-caching").waitFor({ state: "visible", timeout: TIMEOUT });
  await byId(page, "tree-leaf-streaming").waitFor({ state: "visible", timeout: TIMEOUT });
  await byId(page, "disclosure-guides").focus();
  await page.keyboard.press("Enter");
  await attrIs(page, tid("disclosure-guides"), "aria-expanded", "false");
  await byId(page, "disclosure-panel-guides").waitFor({ state: "hidden", timeout: TIMEOUT });
  await page.keyboard.press("Space");
  await attrIs(page, tid("disclosure-guides"), "aria-expanded", "true");
  assert.equal(await byId(page, "disclosure-advanced").getAttribute("aria-expanded"), "true");
  await byId(page, "tree-leaf-caching").waitFor({ state: "visible", timeout: TIMEOUT });
});

await run("overview tabs keyboard (arrows wrap, Home/End, Enter)", async (page) => {
  await goto(page, "/", "settled");
  const expectSelected = async (id, content) => {
    await attrIs(page, tid(`tab-${id}`), "aria-selected", "true");
    await attrIs(page, tid(`tab-${id}`), "tabindex", "0");
    await textIs(page, "tab-panel", content);
    await attrIs(page, tid("tab-panel"), "aria-labelledby", `tab-${id}`);
    await waitFor(page, (i) => document.activeElement?.id === `tab-${i}`, id, `focus on tab-${id}`);
  };
  await byId(page, "tab-summary").focus();
  await page.keyboard.press("ArrowRight");
  await expectSelected("activity", "Activity: 12 updates in the last 24 hours.");
  await page.keyboard.press("ArrowRight");
  await expectSelected("notes", "Notes: No open issues.");
  await page.keyboard.press("ArrowRight");
  await expectSelected("summary", "Summary: 200 records across 5 teams.");
  await page.keyboard.press("ArrowLeft");
  await expectSelected("notes", "Notes: No open issues.");
  await page.keyboard.press("Home");
  await expectSelected("summary", "Summary: 200 records across 5 teams.");
  await page.keyboard.press("End");
  await expectSelected("notes", "Notes: No open issues.");
  assert.equal(await page.evaluate(() => window.scrollY), 0, "Home/End do not scroll the page");
  await byId(page, "tab-activity").focus();
  await page.keyboard.press("Enter");
  await attrIs(page, tid("tab-activity"), "aria-selected", "true");
  await byId(page, "tab-summary").focus();
  await page.keyboard.press("Space");
  await attrIs(page, tid("tab-summary"), "aria-selected", "true");
  assert.equal(await byId(page, "tab-activity").getAttribute("tabindex"), "-1");
});

await run("overview filter no match + clear", async (page) => {
  await goto(page, "/", "settled");
  await byId(page, "filter-input").click();
  await page.keyboard.insertText("zzz");
  await textIs(page, "filter-count", "0 items");
  await textIs(page, "filter-empty", "No matching items");
  assert.equal(await byId(page, "filter-item").count(), 0);
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("date");
  await textIs(page, "filter-count", "1 item");
  assert.equal(await byId(page, "filter-empty").count(), 0);
  assert.deepEqual(await byId(page, "filter-item").allTextContents(), ["Date"]);
});

await run("records static structure", async (page) => {
  await goto(page, "/records", "settled");
  const input = page.locator(`div.records-toolbar > div.field > input.input[type=search]${tid("records-search")}`);
  assert.equal(await input.inputValue(), "");
  assert.equal(await page.locator(`label.field-label[for="${await input.getAttribute("id")}"]`).textContent(), "Search records");
  assert.equal(await page.locator(`p.muted${tid("records-count")}`).textContent(), "Showing 200 of 200");
  assert.equal(await page.locator(`p.summary${tid("selection-summary")}[role=status]`).textContent(), "0 selected");
  const heads = await page.locator(`table.records-table${tid("records-table")} thead tr th`).evaluateAll((ths) =>
    ths.map((th) => [th.textContent, th.getAttribute("aria-label"), th.getAttribute("aria-sort")]),
  );
  assert.deepEqual(heads, [
    ["", "Select", null],
    ["Name", null, "none"],
    ["Email", null, null],
    ["Team", null, null],
    ["Score", null, "none"],
    ["Updated", null, null],
    ["", "Actions", null],
  ]);
  assert.equal(await page.locator(`button.sort-button[type=button]${tid("sort-name")}`).count(), 1);
  const ids = await rowIds(page);
  assert.equal(ids.length, 200);
  assert.equal(ids[0], "r001");
  assert.equal(ids[199], "r200");
  const first = await row(page, "r001").evaluate((tr) => ({
    cells: [...tr.children].map((td) => td.dataset.testid ?? td.firstElementChild?.dataset.testid),
    select: tr.querySelector('input[type=checkbox][data-testid="record-select"]').getAttribute("aria-label"),
    name: tr.querySelector('[data-testid="record-name"]').textContent,
    updated: tr.querySelector('[data-testid="record-updated"]').textContent,
    edit: [...tr.querySelectorAll('button.button[type=button][data-testid="record-edit"]')].map((b) => [b.getAttribute("aria-label"), b.textContent]),
  }));
  assert.deepEqual(first.cells, ["record-select", "record-name", "record-email", "record-team", "record-score", "record-updated", "record-edit"]);
  assert.equal(first.name, "Katherine Hopper");
  assert.equal(first.select, "Select Katherine Hopper");
  assert.match(first.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(first.edit, [["Edit Katherine Hopper", "Edit"]]);
  assert.equal(await byId(page, "edit-dialog").isVisible(), false);
});

await run("records-sort-toggle (correctness only)", async (page) => {
  await goto(page, "/records", "settled");
  await byId(page, "sort-score").click();
  await waitFor(page, () => document.querySelector('[data-testid="record-row"]')?.dataset.id === "r004", undefined, "asc first r004");
  await byId(page, "sort-score").click();
  await waitFor(page, () => document.querySelector('[data-testid="record-row"]')?.dataset.id === "r147", undefined, "desc first r147");
  assert.equal(await page.locator("th", { has: byId(page, "sort-score") }).getAttribute("aria-sort"), "descending");
  await byId(page, "sort-name").click();
  await waitFor(page, () => document.querySelector('[data-testid="record-row"]')?.dataset.id === "r028", undefined, "name asc first r028");
  assert.equal(await row(page, "r028").getByTestId("record-name").textContent(), "Ada Engelbart");
  assert.equal(await page.locator("th", { has: byId(page, "sort-name") }).getAttribute("aria-sort"), "ascending");
  assert.equal(await page.locator("th", { has: byId(page, "sort-score") }).getAttribute("aria-sort"), "none");
});

await run("records keyed rows survive sort + search; selection kept; Space toggles; empty state", async (page) => {
  await goto(page, "/records", "settled");
  await page.evaluate(() => {
    window.__row016 = document.querySelector('[data-testid="record-row"][data-id="r016"]');
  });
  await row(page, "r016").getByTestId("record-select").focus();
  await page.keyboard.press("Space");
  await textIs(page, "selection-summary", "1 selected");
  await byId(page, "sort-score").click();
  await waitFor(page, () => document.querySelector('[data-testid="record-row"]')?.dataset.id === "r004", undefined, "sorted");
  await byId(page, "records-search").click();
  await page.keyboard.insertText("knuth");
  await textIs(page, "records-count", "Showing 15 of 200");
  assert.equal(
    await page.evaluate(() => window.__row016 === document.querySelector('[data-testid="record-row"][data-id="r016"]')),
    true,
    "row identity kept",
  );
  assert.equal(await row(page, "r016").getByTestId("record-select").isChecked(), true);
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("no-such-person");
  await textIs(page, "records-count", "Showing 0 of 200");
  await textIs(page, "records-empty", "No records match");
  assert.equal(await page.locator(`tbody tr td[colspan="7"]${tid("records-empty")}`).count(), 1);
  assert.equal(await text(page, "selection-summary"), "1 selected");
});

await run("records-dialog-save", async (page) => {
  await goto(page, "/records", "settled");
  await row(page, "r003").getByTestId("record-select").click();
  await textIs(page, "selection-summary", "1 selected");
  await row(page, "r001").getByTestId("record-edit").click();
  await byId(page, "edit-dialog").waitFor({ state: "visible", timeout: TIMEOUT });
  const dialog = await byId(page, "edit-dialog").evaluate((d) => ({
    tag: d.tagName,
    cls: d.className,
    labelledby: d.getAttribute("aria-labelledby"),
    title: document.getElementById(d.getAttribute("aria-labelledby"))?.textContent,
    titleTestId: document.getElementById(d.getAttribute("aria-labelledby"))?.dataset.testid,
    modal: d.matches(":modal"),
  }));
  assert.deepEqual(dialog, { tag: "DIALOG", cls: "dialog", labelledby: "edit-dialog-title", title: "Edit record", titleTestId: "edit-dialog-title", modal: true });
  await waitFor(page, () => document.querySelector('[data-testid="edit-name"]').value === "Katherine Hopper", undefined, "draft");
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("Renamed Record");
  await byId(page, "edit-save").click();
  await byId(page, "edit-dialog").waitFor({ state: "hidden", timeout: TIMEOUT });
  await waitFor(
    page,
    () => document.querySelector('[data-testid="record-row"][data-id="r001"] [data-testid="record-name"]')?.textContent === "Renamed Record",
    undefined,
    "r001 renamed",
  );
  assert.equal(await text(page, "selection-summary"), "1 selected");
  assert.deepEqual(await focusedTestId(page), { testid: "record-edit", id: "", row: "r001" });
  await waitFor(
    page,
    () => document.querySelector('[data-testid="record-row"][data-id="r001"] [data-testid="record-edit"]')?.getAttribute("aria-label") === "Edit Renamed Record",
    undefined,
    "edit aria-label updated",
  );
  assert.equal(await row(page, "r001").getByTestId("record-select").getAttribute("aria-label"), "Select Renamed Record");
  assert.equal(await byId(page, "edit-dialog").count(), 1, "only one dialog");
});

await run("records dialog: save disabled on blank, Enter saves, name-sorted table re-sorts", async (page) => {
  await goto(page, "/records", "settled");
  await byId(page, "sort-name").click();
  await waitFor(page, () => document.querySelector('[data-testid="record-row"]')?.dataset.id === "r028", undefined, "name sorted");
  await row(page, "r001").getByTestId("record-edit").click();
  await waitFor(page, () => document.activeElement?.dataset.testid === "edit-name" && document.activeElement.value === "Katherine Hopper", undefined, "open");
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("   ");
  await waitFor(page, () => document.querySelector('[data-testid="edit-save"]').disabled, undefined, "save disabled");
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("  Aaron First ");
  await waitFor(page, () => !document.querySelector('[data-testid="edit-save"]').disabled, undefined, "save enabled");
  await page.keyboard.press("Enter");
  await byId(page, "edit-dialog").waitFor({ state: "hidden", timeout: TIMEOUT });
  await waitFor(page, () => document.querySelector('[data-testid="record-row"]')?.dataset.id === "r001", undefined, "r001 re-sorted first");
  assert.equal(await row(page, "r001").getByTestId("record-name").textContent(), "Aaron First");
  assert.deepEqual(await focusedTestId(page), { testid: "record-edit", id: "", row: "r001" });
});

await run("records-dialog-cancel (correctness only) + Cancel button", async (page) => {
  await goto(page, "/records", "settled");
  await row(page, "r002").getByTestId("record-edit").click();
  await byId(page, "edit-dialog").waitFor({ state: "visible", timeout: TIMEOUT });
  await waitFor(page, () => document.activeElement?.dataset.testid === "edit-name", undefined, "focus in dialog");
  await page.keyboard.insertText("changed");
  await page.keyboard.press("Escape");
  await byId(page, "edit-dialog").waitFor({ state: "hidden", timeout: TIMEOUT });
  assert.equal(await row(page, "r002").getByTestId("record-name").textContent(), "Hedy Floyd");
  await waitFor(page, () => document.activeElement?.closest("[data-testid=record-row]")?.dataset.id === "r002" && document.activeElement.dataset.testid === "record-edit", undefined, "focus back on r002 edit");
  await row(page, "r005").getByTestId("record-edit").click();
  await byId(page, "edit-dialog").waitFor({ state: "visible", timeout: TIMEOUT });
  const before = await row(page, "r005").getByTestId("record-name").textContent();
  await waitFor(page, (n) => document.querySelector('[data-testid="edit-name"]').value === n, before, "draft r005");
  await byId(page, "edit-cancel").click();
  await byId(page, "edit-dialog").waitFor({ state: "hidden", timeout: TIMEOUT });
  assert.equal(await row(page, "r005").getByTestId("record-name").textContent(), before);
  assert.deepEqual(await focusedTestId(page), { testid: "record-edit", id: "", row: "r005" });
});

await run("settings static structure", async (page) => {
  await goto(page, "/settings", "settled");
  const form = page.locator(`form.form${tid("settings-form")}`);
  assert.equal(await form.getAttribute("novalidate"), "");
  const fields = await page.locator("form.form div.field").evaluateAll((divs) =>
    divs.map((d) => {
      const input = d.querySelector("input.input");
      return [input.dataset.testid, d.querySelector(`label.field-label[for="${input.id}"]`)?.textContent, input.type, input.getAttribute("inputmode"), input.value];
    }),
  );
  assert.deepEqual(fields, [
    ["settings-name", "Display name", "text", null, "Ada Lovelace"],
    ["settings-email", "Email", "email", null, "ada@example.test"],
    ["settings-quantity", "Quantity", "text", "numeric", "2"],
    ["settings-unit-price", "Unit price", "text", "decimal", "12.50"],
  ]);
  assert.equal(await page.locator(`p.derived${tid("settings-total")}`).textContent(), "Total: $25.00");
  assert.equal(await page.locator(`div.form-actions > button.button.button-primary[type=submit]${tid("settings-submit")}`).textContent(), "Save");
  const status = page.locator(`div.form-actions > p.status[role=status]${tid("settings-status")}`);
  assert.equal(await status.textContent(), "");
  assert.equal(await page.locator(".field-error").count(), 0);
  assert.equal(await byId(page, "settings-error").count(), 0);
});

await run("settings total n/a for invalid quantity or price", async (page) => {
  await goto(page, "/settings", "settled");
  await byId(page, "settings-quantity").click();
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("abc");
  await textIs(page, "settings-total", "Total: n/a");
  assert.equal(await page.locator(".field-error").count(), 0, "errors hidden before submit");
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("2");
  await textIs(page, "settings-total", "Total: $25.00");
  await byId(page, "settings-unit-price").click();
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("1.234");
  await textIs(page, "settings-total", "Total: n/a");
});

await run("settings-submit", async (page) => {
  await goto(page, "/settings", "settled");
  const requests = trackSettingsRequests(page);
  await page.evaluate(() => {
    window.__pendingSeen = false;
    new MutationObserver(() => {
      const button = document.querySelector('[data-testid="settings-submit"]');
      const status = document.querySelector('[data-testid="settings-status"]');
      if (button?.disabled && button.textContent === "Saving…" && status?.textContent === "Saving…") window.__pendingSeen = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  await byId(page, "settings-submit").click();
  await textIs(page, "settings-status", "Saved Ada Lovelace, total $25.00");
  await waitFor(page, () => {
    const b = document.querySelector('[data-testid="settings-submit"]');
    return !b.disabled && b.textContent === "Save";
  }, undefined, "submit re-enabled");
  assert.equal(await page.evaluate(() => window.__pendingSeen), true, "pending UI observed");
  assert.equal(requests.length, 1, "exactly one request");
  const [request] = requests;
  assert.equal(request.method(), "POST");
  assert.equal(new URL(request.url()).pathname, "/api/settings");
  assert.equal(request.headers()["content-type"], "application/json");
  assert.deepEqual(JSON.parse(request.postData()), { name: "Ada Lovelace", email: "ada@example.test", quantity: "2", unitPrice: "12.50" });
  const response = await request.response();
  assert.equal(response.status(), 200);
  assert.equal(response.headers()["cache-control"], "no-store");
  assert.equal(await byId(page, "settings-error").count(), 0);
});

await run("settings-submit-error (+ Enter submits, error cleared on resubmit)", async (page) => {
  await goto(page, "/settings", "settled");
  const requests = trackSettingsRequests(page);
  await byId(page, "settings-name").click();
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("fail");
  await byId(page, "settings-submit").click();
  await waitFor(page, () => {
    const b = document.querySelector('[data-testid="settings-submit"]');
    return b.disabled && b.textContent === "Saving…";
  }, undefined, "pending");
  await textIs(page, "settings-error", "The server rejected this display name.");
  assert.equal(await page.locator(`p.alert[role=alert]${tid("settings-error")}`).count(), 1);
  await textIs(page, "settings-status", "");
  await waitFor(page, () => {
    const b = document.querySelector('[data-testid="settings-submit"]');
    return !b.disabled && b.textContent === "Save";
  }, undefined, "submit re-enabled");
  assert.equal(requests.length, 1);
  assert.equal((await requests[0].response()).status(), 422);
  await byId(page, "settings-name").click();
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("Grace Hopper");
  await page.keyboard.press("Enter");
  await waitFor(page, () => !document.querySelector('[data-testid="settings-error"]'), undefined, "error removed on pending");
  await textIs(page, "settings-status", "Saved Grace Hopper, total $25.00");
  assert.equal(requests.length, 2);
});

await run("settings-validation (correctness only)", async (page) => {
  await goto(page, "/settings", "settled");
  const requests = trackSettingsRequests(page);
  await byId(page, "settings-name").click();
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("Al");
  await byId(page, "settings-email").click();
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("nope");
  assert.equal(await page.locator(".field-error").count(), 0, "no errors before first submit");
  await byId(page, "settings-submit").click();
  await textIs(page, "settings-name-error", "Display name must be at least 3 characters.");
  await textIs(page, "settings-email-error", "Enter a valid email address.");
  await attrIs(page, tid("settings-name"), "aria-invalid", "true");
  await attrIs(page, tid("settings-email"), "aria-invalid", "true");
  for (const field of ["name", "email"]) {
    const describedBy = await byId(page, `settings-${field}`).getAttribute("aria-describedby");
    assert.equal(await page.locator(`#${describedBy}`).getAttribute("data-testid"), `settings-${field}-error`);
    assert.equal(await page.locator(`p.field-error#${describedBy}`).count(), 1);
  }
  assert.notEqual(await byId(page, "settings-quantity").getAttribute("aria-invalid"), "true");
  assert.equal(await byId(page, "settings-quantity").getAttribute("aria-describedby"), null);
  await waitFor(page, () => document.activeElement?.dataset.testid === "settings-name", undefined, "focus on settings-name");
  await page.waitForTimeout(400);
  assert.equal(requests.length, 0, "no settings request");
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("Alan");
  await waitFor(page, () => !document.querySelector('[data-testid="settings-name-error"]'), undefined, "name error clears on input");
  assert.notEqual(await byId(page, "settings-name").getAttribute("aria-invalid"), "true");
  assert.equal(await text(page, "settings-email-error"), "Enter a valid email address.");
  await byId(page, "settings-quantity").click();
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("0");
  await textIs(page, "settings-quantity-error", "Quantity must be a whole number from 1 to 99.");
});

await run("history-back (scroll restore) + forward lands at top + Back/Forward restore", async (page) => {
  await goto(page, "/", "settled");
  await byId(page, "nav-records").click();
  await textIs(page, "page-title", "Records");
  await waitFor(page, () => document.querySelectorAll('[data-testid="record-row"]').length === 200, undefined, "200 rows");
  await page.evaluate(() => window.scrollTo(0, 1200));
  await waitFor(page, () => Math.abs(window.scrollY - 1200) <= 1, undefined, "scrolled to 1200");
  await page.waitForTimeout(200);
  // A trusted click would first scroll the non-sticky header link into view (scrollY 0), erasing the state under test.
  await byId(page, "nav-settings").dispatchEvent("click");
  await textIs(page, "page-title", "Settings");
  await waitFor(page, () => window.scrollY === 0, undefined, "forward nav lands at top");
  await page.goBack();
  await waitFor(page, () => location.pathname === "/records", undefined, "path /records");
  await textIs(page, "page-title", "Records");
  await waitFor(page, () => document.querySelectorAll('[data-testid="record-row"]').length === 200, undefined, "200 rows");
  await waitFor(page, () => Math.abs(window.scrollY - 1200) <= 50, undefined, "scroll restored within 50px");
  await waitFor(page, () => document.title === "Records | Interaction benchmark", undefined, "title");
  await attrIs(page, tid("nav-records"), "aria-current", "page");
  await page.goBack();
  await textIs(page, "page-title", "Overview");
  await waitFor(page, () => location.pathname === "/" && document.title === "Overview | Interaction benchmark", undefined, "overview restored");
  await attrIs(page, tid("nav-overview"), "aria-current", "page");
  await page.goForward();
  await textIs(page, "page-title", "Records");
  await attrIs(page, tid("nav-records"), "aria-current", "page");
});

await run("navigation resets route state; settings returns to initial values", async (page) => {
  await goto(page, "/settings", "settled");
  await byId(page, "settings-name").click();
  await page.keyboard.press(selectAll);
  await page.keyboard.insertText("x");
  await byId(page, "settings-submit").click();
  await textIs(page, "settings-name-error", "Display name must be at least 3 characters.");
  await byId(page, "nav-overview").click();
  await textIs(page, "page-title", "Overview");
  await byId(page, "nav-settings").click();
  await textIs(page, "page-title", "Settings");
  assert.equal(await byId(page, "settings-name").inputValue(), "Ada Lovelace");
  assert.equal(await page.locator(".field-error").count(), 0);
  assert.equal(await text(page, "settings-status"), "");
});

await run("POST /api/settings endpoint contract", async () => {
  const post = (body, type = "application/json") =>
    fetch(url("/api/settings"), { method: "POST", headers: { "content-type": type }, body });
  const started = Date.now();
  const ok = await post(JSON.stringify({ name: "Ada Lovelace", email: "ada@example.test", quantity: "2", unitPrice: "12.50" }));
  assert.ok(Date.now() - started >= 295, "300 ms delay");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "application/json");
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.deepEqual(await ok.json(), { ok: true, message: "Saved Ada Lovelace, total $25.00", savedAt: "2026-01-01T00:00:00.000Z" });
  const rejected = await post(JSON.stringify({ name: " FAIL ", email: "ada@example.test", quantity: "2", unitPrice: "12.50" }));
  assert.equal(rejected.status, 422);
  assert.deepEqual(await rejected.json(), { ok: false, error: "The server rejected this display name." });
  const garbage = await post("not json{");
  assert.equal(garbage.status, 400);
  assert.deepEqual(await garbage.json(), { ok: false, error: "Invalid settings." });
  for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
    const response = await fetch(url("/api/settings"), { method, headers: { origin: new URL(base).origin } });
    assert.equal(response.status, 405, `${method} -> 405`);
  }
});

await browser.close();
console.log(`\ncontract smoke: ${passed.length} passed, ${failed.length} failed`);
if (failed.length) {
  console.log(failed.map((name) => `  FAIL ${name}`).join("\n"));
  process.exit(1);
}
