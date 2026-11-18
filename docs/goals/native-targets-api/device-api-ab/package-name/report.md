# Package-name test: what to call the headless component library

## Recommendation

**Rename `@markless/ui` to `@markless/unstyled`, and keep `@markless/ui` for one release as a deprecated package that re-exports it. Do not use `base`.**

Why, in three lines:

- **The agent test ties.** Every candidate is within one reader of the top score, so under the fixed rule all nine names tie. No name gave a wrong meaning of its own.
- **The tie goes to Part 1.** I read the real-world evidence as backing `unstyled`. It is the word the established libraries lead with, and it is the plain word they use to explain "headless". "Headless" mostly means something else (browsers, back ends), and `@x/ui` usually names a styled library.
- **`base` is the one name both parts argue against.** In Part 2 it was the only name to lose readers, and it was ranked last by 11 of 12. In Part 1 it already has three competing meanings in this audience's tools. This disagrees with the owner's guess that people "might" know `base`.

The owner's call: this recommendation relies on my reading of Part 1 to break a nine-way tie. If the owner weighs package-name precedent over the descriptor word, `headless` is the evidence-backed alternative. It tied `unstyled` in ranking and has more packages named after it (see "Where Part 1 and Part 2 disagree").

## The table

| Name | Real-world precedent (Part 1) | Blind namers who proposed it (24) | Cold readers fully right, beginner / experienced (3 each) | Wrong meanings (6 readers) | First guess when installing (12) | Rank, mean of 12 (first / last) |
| --- | --- | --- | --- | --- | --- | --- |
| `unstyled` | Most common first word in taglines: 8 libraries. Only 78 npm package names contain it, 5 of them exactly `@x/unstyled`. | 0 | 3 / 3 | 0 | 0 | 1.58 (7 / 0) |
| `headless` | First word for Bits UI, Angular Aria, ng-primitives and `@qwik-ui/headless`. About 21–24 of the top 50 npm "headless" results are UI; the rest are browsers, back ends and terminals. | 18 | 3 / 3 | 0 | 1 | 1.58 (5 / 0) |
| `primitives` | Most common product noun (Radix Primitives, ng-primitives, corvu, rn-primitives). `@x/primitives` has two meanings: tokens or layout boxes in design systems, unstyled widgets in small kits. | 17 | 3 / 3 | 0 | 0 | 3.33 (0 / 0) |
| `ui` (keep) | The brand suffix of most of these libraries (Radix UI, Base UI, Headless UI, Ark UI). As a package name, `@x/ui` is "almost always a ready-to-use, styled component library". | 24 (23 first) | 3 / 3 | 0 | 11 (open guess: 12 of 12 first) | 3.92 (0 / 0) |
| `components` | `@x/components` is usually one product's styled set. Unstyled ones say so in the description. | 11 | 3 / 3 | 0 | 0 (open guess: 12 of 12 second) | 4.58 (0 / 0) |
| `parts` | None in the libraries checked. | 0 | 3 / 3 | 0 | 0 | 6.67 (0 / 0) |
| `elements` | None in the libraries checked. | 0 | 3 / 3 | 0 | 0 | 7.17 (0 / 1) |
| `kit` | Angular CDK ("Component Development Kit"), Qwik's "headless kit" and "styled kit", Ariakit ("toolkit"). | 2 | 3 / 3 | 0 | 0 | 7.33 (0 / 0) |
| `base` | Base UI is a product name, used by three different projects. `@x/base` usually holds base classes or shared utilities. Tailwind's `@layer base` means reset styles. | 0 | 2 / 3 | 0 | 0 | 8.83 (0 / 11) |
| `base`, inner namespace renamed `ui` | (as `base`) | — | 3 / 2 | 0 | — | not ranked |

How to read it:

- **Fully right:** the reader got all three decision questions right:
  - **What is in the package:** UI components or parts.
  - **Styled or not:** the reader's leaning answer was unstyled.
  - **Phones:** the pieces work in the iPhone and Android apps.

  The key is in `plan.md`, written before any reader ran.
- **Scorer agreement:** two scorers agreed on 480 of 480 marks, so no third scorer was needed.
- **Wrong meaning:** a reading that comes from the word itself, for example "base means a default theme". Doubts the reader did not tie to the word do not count.
- **First guess when installing:** after seeing all nine names, each ranker answered "which would you try first in `pnpm add`".
- **Open guess:** asked earlier, before the ranker saw any name: "you need tabs and a modal, what do you type after `pnpm add @markless/`?"
- **Rank:** 1 is clearest, for "what it holds, whether it comes styled, whether it works on phones". Orders were shuffled per reader with a fixed seed (`check/rank-orders.txt`).
- **No collisions:** no listed candidate collides with an existing Markless package name. Blind namers offered `core` 16 times for the inner namespace. It collides with `@markless/core`, so it was not used.

## Each step of the rule, with its numbers

1. **Score:** the mean of the beginner and experienced shares. Eight names score 1.00. `base` scores 0.83 and `base` with `ui` inside scores 0.83.
   - **`base`, beginner reader 2:** lost on styling: "mostly unstyled, or with very plain default styling … I'm only about 50/50 on this, because 'base' could also mean 'the default styled set'".
   - **`base`/`ui`, experienced reader 2:** "'base' could also mean 'base theme', so I'm only about 50/50 on that."
2. **Disqualify:** a name is out when 2 or more of its 6 readers give it a wrong meaning of its own. No name reached that; every name had 0.
3. **Highest score:** the eight names at 1.00.
4. **Tie:** names within one reader (1/6) of the top tie. `base`, at 0.83, is exactly one reader below, so all nine tie. The tie goes to Part 1, which favours `unstyled` (next section).

The agent test did not separate the names on its main measure. The page carries a lot of the meaning: the `root`/`trigger`/`content` parts read as a headless library to these readers whatever the package is called. For `ui`, a reader said "I'm only medium sure, since the name 'ui' doesn't tell me either way". For `components`: "the name 'components' doesn't say this either way". The secondary measures (ranking, clash remarks, install guess) are where the names differ.

## Part 1: real-world evidence

All quotes and numbers are in `evidence/`, with a URL or command for each. The quotes were fetched by three research subagents on 2026-11-17; I checked the key quotes below against their saved pages. Anything marked UNVERIFIED there is left out here.

### How the established libraries describe themselves (`evidence/libraries.md`)

- **"Unstyled" is the most common first word** in title tags and hero lines. Eight libraries lead with it:
  - Radix: "Unstyled, accessible, open source React primitives…" (radix-ui.com/primitives).
  - Base UI: "Unstyled UI components for building accessible user interfaces" (base-ui.com).
  - Headless UI: "Completely unstyled, fully accessible UI components" (headlessui.com).
  - Ark UI's heading.
  - Kobalte.
  - Reka UI.
  - corvu: "Unstyled UI primitives for SolidJS".
  - rn-primitives: "Unstyled, accessible React Native components with a unified API for iOS, Android, and Web".
- **The product named "Headless" never uses "headless" to describe itself.** Its tagline says "unstyled", and its launch post never explains the word. Base UI's npm description defines one word with the other: "a library of headless ('unstyled') React components".
- **"Headless" leads where a library brands itself a headless kit:**
  - Bits UI: "The headless components for Svelte".
  - Angular Aria: "a collection of headless, accessible directives".
  - ng-primitives: "a low-level headless UI component library".
  - Qwik UI: `@qwik-ui/headless`.
- **"Primitives" is the most common noun for the product itself.** Styled libraries use it for the layer underneath them:
  - Radix Themes sends readers to "Radix Primitives" for "the unstyled components".
  - Tamagui's `@tamagui/ui` says "Unstyled, behavior-first UI primitives".
- **"Base" appears only in product names:** Base UI and MUI Base. It also appears in Radix's phrase "the base layer of your design system".

### Usage signals (`evidence/npm.md`, week 2026-11-10 to 2026-11-16)

- **Weekly downloads of the unstyled layers:**

  | Package | Weekly downloads |
  | --- | ---: |
  | `@radix-ui/react-dialog` | 98.0 M |
  | `@base-ui/react` | 31.0 M |
  | `radix-ui` | 29.4 M |
  | `react-aria` | 17.5 M |
  | `@headlessui/react` | 9.9 M |
  | `@kobalte/core` | 6.1 M |
  | `@qwik-ui/headless` | 8,058 |
  | `ng-primitives` | 36,870 |

  Counts include CI and transitive installs.
- **What scoped packages usually hold**, from the top 20 by downloads for each suffix:
  - **`@x/ui`:** "almost always a ready-to-use, styled component library or design system (Expo, Sanity, Nuxt, WordPress, Lobe, shadcn)". Only a few are unstyled.
  - **`@x/base`:** base classes, shared types or utilities (`@material/base`, `@spectrum-web-components/base`, `@wallet-standard/base`), plus number bases (`@scure/base`).
  - **`@x/primitives`:** design tokens or layout boxes in design systems (`@atlaskit/primitives`, `@primer/primitives`), unstyled widgets in smaller kits.
  - **`@x/components`:** usually one product's styled set.
  - **`@x/core`:** the engine of a package family.
- **What the top npm results for "headless" are:** 21 to 24 of the top 50 are UI. The rest are headless browsers (Puppeteer), back ends without a front end (Coveo, Wix, AEM) and terminal or editor modes. The bare `headless` package is an Xvfb wrapper, a virtual display for running browsers without a screen.
- **Package names containing each word.** Counted over all 4,619,146 package names from npm's `_all_docs` list, where the word is a whole piece of the name:

  | Word | Names containing it | Of those, exactly `@x/<word>` |
  | --- | ---: | ---: |
  | `ui` | 114,800 | 8,732 |
  | `components` | 36,647 | 3,908 |
  | `kit` | 20,724 | 544 |
  | `base` | 15,302 | 692 |
  | `headless` | 1,358 | 129 |
  | `primitives` | 1,048 | 293 |
  | `unstyled` | 78 | 5 |

  So `unstyled` is common as a describing word but rare as a package name.

### Do developers know the word? (`evidence/awareness.md`)

- **No survey measures it.** State of React is the only survey with a component-library question, and it asks about brands, not the word.
  - **State of React 2025:** Radix was used by 48% and unknown to 19%. Headless UI was used by 22% and unknown to 23%.
  - **Who answers it:** respondents are experienced (median 8 years; about 21% have 0–4 years).
- **The survey itself explains the word.** State of React put "headless" in quotes in 2024. In 2025 it added a definition: "headless UI libraries–in other words UI libraries that provide component behavior, but leave styling up to you".
- **Beginners ask what it means.** On Hacker News in 2021 (news.ycombinator.com/item?id=29116806), someone asked: "can someone explain in layman terms what is headless UI?"
- **The other meanings dominate.** Stack Overflow question counts:

  | Phrase | Questions |
  | --- | ---: |
  | "headless chrome" | 1,418 |
  | "headless browser" | 1,395 |
  | "headless cms" | 576 |
  | "headless ui" | 124 |
  | "headless component" | 5 |

  Wikipedia's "Headless" page lists browser, software and CMS meanings, but not UI.
- **No evidence found of actual mix-ups.** The research found no first-hand quote of someone confusing headless UI with a headless CMS or browser. The meanings exist side by side, and explainers separate them.
- **`base` already means other things in this audience's tools:**
  - **Tailwind (used by 51% in State of CSS 2025):** `@layer base` means reset styles. "add them to the `base` CSS layer in your CSS using `@layer base`" (tailwindcss.com/docs/preflight).
  - **"Base UI" has named three projects:** MUI's `@mui/base`, MUI's `@base-ui/react`, and Uber's styled Base Web.
  - **A user was confused by it:** github.com/mui/base-ui/issues/1176 was filed because two packages were "both named 'Base UI'".
  - **Design tokens:** "base tokens" is another name for primitive tokens.
- **`primitives` and `unstyled` have other meanings too:**
  - **`primitives`:** JavaScript value types, Atlassian's styled layout boxes, and the raw-value token tier.
  - **`unstyled`:** browser defaults, as in "flash of unstyled content".

### What Part 1 says about the owner's claim

- **"Most people don't know what headless is": partly supported.**
  - The surveys explain the word.
  - Beginners ask what it means.
  - Libraries explain it with "unstyled".
  - Its other meanings are far more common.
  - What is not measured: no source measures how many beginners understand it.
- **"Base they might": not supported.** The word is familiar, but in this audience's tools it already means reset styles, base classes, or a product of that name.

## Where Part 1 and Part 2 disagree

- **`headless` against `unstyled`.**
  - **Part 2:** they tied in ranking, mean 1.58 each. `unstyled` was first for 7 rankers, `headless` for 5. Both scored 6 of 6 cold readers.
  - **Blind namers:** 18 of 24 proposed `headless`; none proposed `unstyled`.
  - **Part 1 is split:** `unstyled` is the word the field uses to describe itself, but `headless` has more packages named after it. I gave the tie to `unstyled` because the owner's question is what people know, and "unstyled" is the word the field uses to explain "headless".
- **`ui` itself.**
  - **Part 2:** strongest on finding the package. 12 of 12 rankers typed `ui` first when guessing blind, 11 of 12 chose it from the list, and 23 of 24 blind namers put it first.
  - **Part 1:** cuts the other way. `@x/ui` usually means a styled library.
  - **Readers agreed with Part 1.** All 54 cold readers asked about a `@markless/ui` beside the renamed package expected a styled layer built on top of it. Many also said having both would confuse them.
  - **The cost of renaming:** people will type `ui` first. The compatibility package below covers that for one release. After that, a styled `@markless/ui` would match what readers already expect.
- **`base`:** Part 1 and Part 2 agree, and both disagree with the owner's guess.
  - **Collision remarks:** 5 of 6 `base` readers remarked on `import { base } from '@markless/base'`, for example "it's odd that the package and the namespace have the same name". Rankers called it least clear 11 times.
  - **Renaming the inner namespace did not help.** The blind namers' choice for the inner name was `ui` (24 of 24 first). With it, the clash just moved: 3 of 6 readers then confused the inner `ui` with a `@markless/ui` package. One said "`ui` is also the name of the object imported from `base`".
- **Phones.** In no version did rankers find the name answering "does it work on phones". Typical remark: "None of the nine names says whether the pieces work in the phone apps." All 60 cold readers said yes, but they inferred it from the page: `native.*` is imported separately from `@markless/device`. Whatever the name, the docs' first line should say the pieces work on iPhone, Android and the web.

## Rename cost, measured

### Where `@markless/ui` is imported in this repo

Source: the yuku analyzer's module graph over all 7,750 tracked code files (`check/ui-importers.ts`, output in `check/ui-importers.out.txt`). It found 202 import records of `@markless/ui` or one of its subpaths, in 96 files (93 `.tsrx`, 3 `.ts`):

| Area | Files | Import records |
| --- | ---: | ---: |
| `website` | 59 | 97 |
| `docs/goals/native-targets-api` (experiment pages, not shipped) | 34 | 68 |
| `packages/headless/sr-app` | 1 | 35 |
| `packages/headless/tools` | 1 | 1 |
| `packages/router` | 1 | 1 |

Specifiers:

| Specifier | Records |
| --- | ---: |
| `@markless/ui` | 199 |
| `@markless/ui/pad` | 1 |
| `@markless/ui/vite` | 1 |
| `@markless/ui/api/manifest.json?raw` | 1 |

The library's own source imports itself by relative path, so it does not appear here.

The count is partial. 74 modules have imports the analyzer cannot see (computed `import()` or `import.meta.glob`), and 15 have local specifiers it could not resolve. A `@markless/ui` import hidden in one of those would not be counted. Guessless could not price this claim, because it refuses `.tsrx` files by design.

Other places a rename touches:

- **Package dependencies:** read from each tracked `package.json` as JSON. `website/package.json` and `packages/headless/sr-app/package.json` depend on `@markless/ui` (`workspace:*`).
- **Prose mentions:** a plain text count, since the analyzer does not read Markdown. About 101 mentions of `@markless/ui` in tracked `.md`/`.mdx` files outside `docs/goals`:
  - **`website/pages`:** 13 files.
  - **`packages/headless`:** 13 files.
  - **Elsewhere:** the root README, CHANGELOG, `AGENTS.md` and `CLAUDE.md` (generated from `.ruler/AGENTS.md`), and the agent skill folders.
- **The package's own surface:** `packages/headless/components/package.json` has 43 subpath exports, plus `./vite` and `./api/manifest.json`. Each needs a matching path in a compatibility package.

### Published things affected

- **npm:** https://www.npmjs.com/package/@markless/ui. Version 0.4.0 was published 2026-08-25, with 5 downloads in the week 2026-11-10 to 2026-11-16. The repo's manifest is `private: true` at 0.5.0, so the next publish is a separate step either way.
- **Docs:** the `/ui/` section of markless.dev, 32 files in `website/pages/ui/`. For example https://markless.dev/ui and https://markless.dev/ui/tabs (both returned 200). Whether the route moves to `/unstyled/` is a separate choice. Keeping `/ui/` as the docs path avoids redirects.

### Compatibility path (not done)

1. **Publish the new package:** `@markless/unstyled`, with the same exports map, built from the same source folder.
2. **Turn `@markless/ui` into a shim for one release:**
   - `"dependencies": { "@markless/unstyled": "<same version>" }`.
   - Each subpath re-exports the new one, e.g. `src/tabs/index.ts` contains `export * from '@markless/unstyled/tabs'`, and the root does `export * from '@markless/unstyled'`.
   - `./vite` re-exports the plugin.
3. **Deprecate the old name on npm:** `npm deprecate @markless/ui "renamed to @markless/unstyled"`.
4. **Update the repo:** move the 96 importing files and the two dependents to the new name.
5. **Free the name:** after one release, stop publishing the shim. `@markless/ui` is then free for the styled layer, which is what readers already expect it to be.

## Limits

- **Part 2 cannot test the owner's claim.** Every participant was an Opus subagent, and every one already knows "headless". The "beginner one year in" framing is a prompt, not a person. Beginner and experienced readers scored the same on every name. The owner's claim about real people rests on Part 1, which has no direct measure of beginners either.
- **Small samples.** Six cold readers per name, 12 rankers, 24 blind namers. A one-reader gap is inside the spread between readers of the same name, so the main measure did not separate the names.
- **The page carried the meaning.** The compound-part structure told readers "headless library" whatever the package name, so "fully right" was nearly saturated.
- **Choices I made that shape the result:**
  - **I wrote the page and the answer key.**
  - **Breaking the tie:** the tie went to my reading of Part 1. Someone else could read it as favouring `headless`.
  - **Install question:** the "first guess when installing" was asked after the open guess, by the same rankers.
- **Inherited context.** Agents inherit the repo's `CLAUDE.md`, which I could not remove.
- **Model agreement.** All 24 blind namers proposed `ui`. That shows how strongly the model agrees with itself, not how people would split.
- **Part 1 gaps:**
  - **Reddit:** blocked, so no claim is made about it.
  - **Google Trends:** not obtained.
  - **Ark UI and Angular CDK intro pages:** could not be read without a browser.
  - **Package-name counts:** the name list may include some unpublished packages, and how many could not be measured.
- **Completeness of the importer count:** partial, as stated in the rename-cost section. Nothing was renamed, built or published.

## Files

All paths are relative to `package-name/`.

- **`plan.md`:** the answer key, decision rule and candidates, written before any participant ran.
- **Prompt generators, in `check/`:** `make-blind.mjs`, `make-cold.mjs`, `make-rank.mjs` and `common.mjs`. The prompts they wrote are in `prompts/`; the scorer prompt is `scorer-cold.md`.
- **Raw answers:** `blind/raw/`, `cold/raw/` (pages in `cold/pages/`) and `rank/raw/`. For rankers, `<id>.md` is the open guess and `<id>-2.md` is the ranking.
- **Scores:** `scores/cold-s1.json` and `scores/cold-s2.json`. Tallies are in `check/blind-tally.txt`, `check/cold-tally.txt` and `check/rank-tally.txt`, produced by `tally-blind.py`, `compare-cold.py` and `tally-rank.py`.
- **Transcript check:** `check/extract.py`, with `map.tsv` and `followups.tsv`, confirms each participant read only its own prompt file. 96 participants, 0 problems.
- **Rename cost:** `check/ui-importers.ts`, `check/ui-importers.out.txt` and `check/ui-importers-summary.txt`.
- **Real-world evidence:** `evidence/libraries.md`, `evidence/npm.md` and `evidence/awareness.md`.
