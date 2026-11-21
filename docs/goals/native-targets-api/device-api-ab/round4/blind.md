# Round 4, blind phase: what writers invent for a modal sheet and a tab bar

## Summary

**Modal sheet.** With no sheet API, 8 of 8 writers put the decision on the page that is shown: `export const presentation = 'sheet'` in the route file, read by `@markless/router`. None put it on the link, none used an in-page component, none used app config.

**Tab bar.** With no tab API, 8 of 8 writers made one app-level file that lists every tab: `tabs.tsrx` beside `pages/` (7) or `pages/_tabs.tsrx` (1), holding `<TabBar>` (6) or `<Tabs>` (2) with one `<Tab href label icon badge onSelect>` per tab, imported from `@markless/router`. None used static config, each page's markup, a `@markless/ui` family or one export per route file. The brief fixes "no layout files", and this file comes close to being one. 2 writers listed "this file is allowed beside the no-layout rule" as a guess. 4 others cited the rule as their reason for keeping tabs out of the pages.

Scope changed during the run: the owner stopped variants A to D for both questions until ecosystem research is done, so this note covers the blind phase only.

## Modal sheet (8 writers)

| What the writers did | Count |
| --- | --- |
| Sheet decided by the page shown: `export const presentation = 'sheet'` (7 also declared `type Presentation = 'screen' \| 'sheet'`) | 8 of 8 |
| All three cart links (Home, product, Orders) open the cart as a sheet | 8 of 8 (one rule in one file covers every link) |
| Address choice (task 3) gets back to checkout through a `storage` key, then `back()` | 8 of 8; it works on a phone under the sheet's rules for 8 of 8 |
| Second step inside the address sheet (task 4) is state in that one page (`step = 'list' \| 'form'` or `adding`) | 8 of 8; none pushed a second route inside the sheet |
| "Delete this order?" uses the `modal` family (`<modal.root alert>`), not a sheet | 8 of 8 |
| Notification carries `/cart` and needs no code; the app opens Home with the cart sheet over it | 8 of 8 |
| Pages that branch on `platform === 'web'` or `!== 'web'` (to hide a Close button, or to `navigate(…, { replace: true })` instead of `back()`) | 8 of 8, 1 to 3 places each |
| Rule breaks against the given sheet (for example code after `back()`) | 0, both graders |
| Confidence | 3 of 5 for 8 of 8 |

Why they chose the route, in their words:

- "Deep links and push notifications, which have only a path and no link or opening page, still present it correctly, and every way into the page agrees."
- "Putting it on links would repeat it at every link and leave the notification without a way to say it. Putting it on the opening page would mean the cart has no path, so a notification could not open it."
- Every writer named `<Link sheet>` as the alternative they rejected.

## Tab bar (8 writers)

| What the writers did | Count |
| --- | --- |
| One app-level file lists the tabs, with live `storage` reads and `@if` | 8 of 8 |
| Badge: a `storage('newOrders')` count, raised on checkout, reset by the tab's `onSelect` | 8 of 8 (4 also reset it in the Orders page body) |
| Account tab: `@if (session !== '')` around its `<Tab>` | 8 of 8 |
| Checkout hides the bar with a page export `export const tabBar = false` | 5 |
| Bar shown only on a tab's root screen, as a rule | 2 |
| A `hiddenOn={['/checkout', …]}` prop on the bar | 1 |
| Website: the same component renders a `<nav>` of links | 5 |
| Website: the tab file is phone-only, and the writer hand-wrote a separate web nav | 3 |
| Places to edit to add a fourth tab | 2 (tab line + page) for 5; 3 (plus the web nav) for 3 |
| Rule breaks against the given sheet | 0, both graders |
| Confidence | 3 of 5 for 8 of 8 |

Why one file, in their words:

- "Static config cannot read `storage`, so it could not show a live badge or a conditional Account tab. Putting the tabs in each page would contradict 'a page renders its screen' and would duplicate the list."
- "The tab bar outlives every screen and is shared across stacks, so it cannot belong to any one page (there are no layouts)."

## Limits

- **The prompts lean toward routes.** The shared sheet explains how a path opened from outside the app builds screens, and task 5 asks for a notification. Both make a sheet with its own URL attractive. A prompt without task 5 might split differently.
- **What writers saw.** Q1 writers saw the real `modal` family's parts and props, from `packages/headless/components/src/modal/modal-types.ts`. They did not see `drawer`, the bottom-sheet family. Q2 writers saw no `@markless/ui` family; the shipped `tabs` family is in-page tabs and was left out.
- **One model family, 8 writers per question.** Unanimous results in a sample of 8 from one model say what this model reaches for. They do not show that people would.
- **Nothing was compiled or run.** "Works" is judged against the sheet's written rules.
- **Grading.** Two graders classified every answer. They agreed on every category, count and true/false field. Their only differences were wording in free-text fields.

## Files

All paths are relative to `round4/`.

- **Prompts:** `q1/prompts/blind-writer.md` and `q2/prompts/blind-writer.md`, built by `check/make-blind.mjs` from `common/` (router, core, device, modal and app-module excerpts) and round 3's `primer-block.txt`.
- **Raw answers:** `q1/raw/blind/W1.md` to `W8.md`, and the same under `q2/`.
- **Grader prompt:** `prompts/scorer-blind.md`.
- **Grader outputs:** `scores/blind-s1.json` and `scores/blind-s2.json`.
- **Checks:** `check/extract.py` checks from each transcript that each writer made exactly one read, of its own prompt file. The map is `check/map.tsv`. `check/stage.py` copies prompts to per-agent scratch files.
