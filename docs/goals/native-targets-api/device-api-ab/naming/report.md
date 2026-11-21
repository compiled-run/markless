# Naming test: the namespace for platform-provided UI

## Decision

**`system`.** Under the decision rule fixed in the brief, five single-word names tie on cold reading. `native` and `system` then tie on blind writers. The rule sends that tie to prior art, which favours `system`.

One step needed a reading the rule did not spell out, and it changes the answer:

- **Literal reading:** the rule says "if the top two are within the spread". The top two by score are `builtin` and `host`, and blind writers break that tie towards `builtin`, 3 writers to 1.
- **My reading:** I treated every name within one reader of the top score as tied. That covers `system`, `native` and `os`, which each lost one reader on the same scoring detail. That detail is not about the name (see "Why the near-tie").
- **The owner's call:** confirm the reading. The literal reading would pick a name that 12 of 12 rankers put fourth or lower.

**What this data cannot settle: `native` against `system`.** On every measure where the decision rule applies, the two came out the same. On preference, `native` won clearly here: ranked clearest by 11 of 12 and preferred to write by 10 of 12. Round 4 found the opposite when readers were asked directly whether each name exists on the website. The section "Why round 4 and this round disagree" explains the difference. The rule does not let preference break a tie, so the decision stays `system`. If the owner weighs what writers reach for over the rule, `native` is the evidence-backed alternative.

## The table that produced it

| Name | Blind writers who proposed it (24) | Cold readers fully right, web / phone (3 each) | Score (mean of the two) | Wrong meanings (6 readers) | Writer mistakes (5 writers) | Rank, mean of 12 (first / last) |
| --- | --- | --- | --- | --- | --- | --- |
| `builtin` | 3 (all third choice, all web) | 3 / 3 | 1.00 | 0 | 0 wrong kind; 7 website guards | 5.33 (0 / 4) |
| `host` | 1 (third choice) | 3 / 3 | 1.00 | 0 | 0; 9 | 5.67 (0 / 8) |
| `system` | 24 (all second choice) | 2 / 3 | 0.83 | 0 | 0; 10 | 2.50 (0 / 0) |
| `native` | 24 (all first choice) | 3 / 2 | 0.83 | 0 | 0; 9 | 1.08 (11 / 0) |
| `os` | 20 (all third choice) | 3 / 2 | 0.83 | 0 | 0; 10 | 3.25 (0 / 0) |
| `ios` / `android` | 0 | 0 / 0 | 0 | 6, disqualified | 0; 15 | 3.17 (1 / 0) |

How to read it:

- **Fully right:** the reader got all three decision questions right. Who decides how the sheet looks on a phone (the platform). What a website visitor gets for the sheet, the camera and the PDF (the browser's own version of each). How the sheet differs from `drawer` (platform-drawn and different per platform, against author-drawn and the same everywhere). The key is in `plan.md`, written before any reader ran. Two scorers agreed on 360 of 360 marks, so no third scorer was needed.
- **Writer mistakes:**
  - **Wrong kind:** the platform element used for the designer-styled panel, or `drawer` used for the sheet that must look like the phone's own.
  - **Website guards:** places where the writer hid the platform element from the website and drew a stand-in, out of 20 elements per name. Every writer of every name did this at least once.
  - **Agreement:** two graders agreed on 630 of 630 marks.
- **Rank:** 12 fresh readers saw the same page in all six spellings, in an order shuffled per reader (`check/rank-orders.txt`), and ranked them for clarity. 1 is clearest.

## Each step of the rule, with its numbers

1. **Score.** `builtin` 1.00 and `host` 1.00. `system`, `native` and `os` 0.83 each. `ios`/`android` 0.
2. **Disqualify** a name when more than 1 in 5 cold readers give it a wrong meaning of its own (2 or more of 6).
   - **`ios`/`android`:** 6 of 6, disqualified (quotes below).
   - **Every other name:** 0 of 6.
3. **Highest score:** `builtin` and `host`, tied.
4. **Tie, within the spread.**
   - **Spread:** fixed in `plan.md` before data as a gap of one reader or less, 1/6.
   - **Who is inside it:** every single-word name. `system`, `native` and `os` are each one reader below the top.
5. **Blind writers within the tie:** `native` 24, `system` 24, `os` 20, `builtin` 3, `host` 1. `native` and `system` tie.
6. **Still tied → prior art.** `~/reports/native-naming.md` ranks `system` first. Apple says "system-provided" and Android "system UI", and CSS's `system-ui` counts the browser as the system. **Result: `system`.**

## Why the near-tie is not about the names

The three single-word readers who were not fully right all missed the same thing: the sheet in the website build. Each named a drawn stand-in before the browser's dialog.

- **`system`, web reader:** "I'd guess sheet becomes a `<dialog>`-style panel or bottom sheet the framework draws itself."
- **`native`, phone reader:** "`native.sheet` would probably become an HTML bottom sheet or dialog."
- **`os`, phone reader:** "`os.sheet` would likely be an HTML bottom sheet or dialog."

The scoring rule, fixed before scoring, counts the first-named reading, so these three are wrong. Under the lenient measure (the website gets some working version, whoever draws it), all 30 single-word readers are right. `builtin` and `host` readers made the same kind of hedge, but named `<dialog>` first. The 6-to-5 gap is one word order per name. It says nothing about what the names mean.

## Disqualified: `ios` / `android`

6 of 6 readers said the website gets nothing. Each read the pair as "this element exists only in that phone's app", which is a meaning of the name itself.

- **Web reader 1:** "My best guess is that the website gets nothing for any of them: the `ios.*` and `android.*` elements render nothing in a browser."
- **Web reader 2:** "`ios.*` only renders in the iPhone app and `android.*` only in the Android app, which is why the page lists both side by side."
- **Phone reader 3:** "the website renders nothing for any of these six components, because they are tied to a platform and there is no native view in a browser."

The pair also cost writers the most:

- **Website guards:** 15 of 20 elements, against 7 to 10 for the single words.
- **Camera:** 5 of 5 pair writers guarded it off the website. 4 of them left website visitors with no live preview. Writers of every single word kept the camera on the website (24 of 25; the other was unsure).

No blind writer proposed a per-platform name. One ranker put the pair first, saying the names "say outright that each phone's own system draws them".

How it was tested: the meaning stayed fixed for every name, so the pair page wrote `ios.x` and `android.x` side by side. Writers got one extra sentence explaining that: each app build renders the one for its platform. Nothing about the website was said for any name.

## Wrong meanings recorded

Recorded verbatim in `scores/cold-s1.json` and `cold-s2.json`.

- **Single-word names:** none, for any of the five.
  - No reader called `system` a design system.
  - No reader called `native` the HTML built-in element.
  - No reader called `os` Node's module.
- **Borderline remark, not counted:** one `host` reader said, as a hedge, "the name could also mean something about a server". They still read it right. Rankers, who saw every name, said the same about `host` 8 times.

## What rankers said

- **`native`, first for 11 of 12:** "the word phone developers already use for something the OS draws itself". Web developers said the same: "the word web developers already use for 'the phone's own UI'".
- **`host`, last for 8 of 12:** "could mean the server, the web host or a WebView container, so it tells me nothing about who draws the sheet".
- **`builtin`, last for 4 of 12:** "doesn't say what these are built into (the framework, the browser or the phone)".
- **Would rather write:** `native` 10 of 12, `system` 2. One of the two `system` readers also named `native` as a close equal.

## Why round 4 and this round disagree

Round 4 (`../round4/report.md`) found:

- **Preference:** 12 of 18 readers preferred `native` over `system` for a camera and a sheet.
- **Ranking:** 13 of 15 ranked `system` first when shown `system`, `native` and `os` together.
- **Misreadings:** 0 of 15 took `native` as the browser's built-in element.
- **Design system:** 15 of 15 said `system` could "somewhat" be read as a design system.
- **Imports:** 3 of 5 `native` writers imported it from `@markless/device`, the wrong package.

This round lines up with round 4's preference result: `native` is ranked clearest by 11 of 12, preferred by 10 of 12, and put first by 24 of 24 blind writers. What my data can say about the gap, in order of how well it is supported:

1. **The question asked decides the winner.** The measures that favoured `native` asked "which is clearest" or "which would you write", and readers answered from familiarity. Round 4's phase 3 asked first, name by name, whether the elements exist on the website. `system` got "yes" 11 times and `native` got "can't tell" 14 times; only after that did readers rank. Put that way, readers judge `system` the safer word for the website. My rankers were asked about the website only as part of an overall clarity question, and `native` won.
2. **Cold, one name at a time, the difference disappears.** My cold readers of `native` and of `system` predicted the website equally well: 5 of 6 each, and 6 of 6 each under the lenient measure. No `native` reader said "not on the web". The "`native` means not on the web" reading appeared only when readers compared names (round 4), and for the per-platform pair (here, 6 of 6).
3. **The design-system reading appears only when prompted.** Round 4 asked readers directly whether `system` could mean a design system, and 15 of 15 said "somewhat". Here nobody was asked. 0 of 6 cold `system` readers and 3 of 18 `system` import-line readers raised it, each to say they would not expect one: "I'd be surprised to find … a design-system theme, because 'system' suggests these are the OS's own controls".
4. **The wrong-package imports come from where the sheet listed the namespace, not from the name.** Round 4's `native` writers got a sheet that put the namespace in `@markless/ui`, and 3 of 5 imported it from `@markless/device`. Here every name had its own package in the sheet, and 0 of 30 writers imported from the wrong one. The import-line test below checks what readers expect each package to hold.

Taken together, `native` is the word writers reach for, and the two names read equally well cold. `system` holds up better only when a reader stops to ask whether the element exists on the website. That is the question behind decision part (b). My data cannot say which effect matters more for real users.

## Import line (`system` and `native`)

Each reader saw one import line and the five usage lines (sheet, camera, PDF, tab bar, menu). There were 6 readers per line, 3 per framing. Each reader said what they assume the package contains, what else they would expect in it, what would surprise them, and who decides how the sheet looks.

| Import line | Package holds only the platform's own UI elements | Platform UI plus device calls (location, haptics, notifications) | Platform draws the sheet | Said the line does not fit |
| --- | --- | --- | --- | --- |
| `import { system } from '@markless/system'` | 1 | 5 | 6 | 0 |
| `import { native } from '@markless/native'` | 2 | 4 | 6 | 0 |
| `import { system } from '@markless/ui'` | 6 | 0 | 6 | 0 |
| `import { native } from '@markless/ui'` | 6 | 0 | 6 | 0 |
| `import { system } from '@markless/device'` | 1 | 5 | 6 | 0 |
| `import { native } from '@markless/device'` | 0 | 6 | 6 | 0 |

Scoring: two scorers agreed on 106 of 108 marks, and a third settled the two disagreements (`scores/imports-tiebreak.md`).

- **The name made no difference here.** `system` and `native` read the same on every line. All 36 readers said the platform draws the sheet.
- **Only `@markless/ui` keeps the package to UI.**
  - **What readers assumed:** 12 of 12 said it holds elements for the platform's own UI, next to the headless parts.
  - **What would surprise them:** device calls in a `ui` package. "I'd be surprised to find device APIs that have no visual, like geolocation, push notifications … in a UI package."
- **A package of its own blurs into `@markless/device`.** 9 of 12 expected `@markless/system` or `@markless/native` to also hold location, haptics, notifications and biometrics. That overlaps the package that already exists for calls.
- **`@markless/device` reads as both.** 11 of 12 assumed it holds platform UI and device calls. None objected to UI elements coming from it. One reader found the PDF viewer "a little out of place next to the hardware features".
- **The design-system reading, unprompted.** 3 `system` readers brought up "design system", and each did so to say they would *not* expect one in the package: "I'd be surprised to find … a design-system theme, because 'system' suggests these are the OS's own controls."
- **What this means for the import:** the prior-art report recommended `@markless/system`. Readers here expect that package to duplicate `@markless/device`. `@markless/ui` gave the narrowest and most accurate expectation.
  - **Caveat from round 4:** there, 3 of 5 `native` writers imported a namespace listed under `@markless/ui` from `@markless/device` anyway.
  - **Writers were not tested here:** this was a reading test only, so the writer question stays open.

## What writers did

- **Kind of element:** writers of every name picked the right kind every time. The platform element went to the platform-look sheet, the camera and the PDF; `drawer` went to the designer panel. 30 of 30 writers, 0 mistakes.
- **No styling or invented members:** no writer styled the platform sheet's frame or used a member the type sheet did not declare.
- **Every writer guarded the website.** With types only and no docs, every writer of every name put the filter sheet behind `@if (platform === 'web')` and gave the website a `drawer`. Most did the same for the PDF with an `<iframe>`.
  - **PDF, kept on the website:** `builtin` 3 of 5, `native` 1, `host` 1, `system` 0, `os` 0.
  - **Camera, kept on the website:** 24 of 25 single-word writers (1 was unsure), against 0 of 5 pair writers.
  - **Their reason:** "nothing published says `system.sheet` works in a browser". The rule for the website was missing from the sheet, so writers fell back on caution.
  - **What this means:** whatever the name, the docs must say "works on the website" in the first line.

## Limits

- **One model family.** Every writer, reader, ranker and scorer was a fresh Opus subagent. Opus's training leans towards web and Expo vocabulary. All 24 blind writers gave the same top two names in the same order, which shows how strongly this model agrees with itself, not how people would split.
  - **Personas, not people:** "web developer", "iOS or Android developer" and "React Native or Expo developer" are prompt framings. They are not real developers.
  - **Inherited context:** agents inherit the repo's `CLAUDE.md`, which I could not remove.
- **Small samples:** 6 cold readers per name, 5 writers, 12 rankers and 6 readers per import line.
  - **How big a gap counts:** one reader in six is within the spread between readers of the same name. Every gap between single-word names in the decision table is that size.
  - **The only clear gaps:** `ios`/`android` against everything else, and `native` against everything else in ranking.
- **My choices that shape the result:**
  - **I wrote the page, the type sheets and the answer key.**
  - **Hedged answers:** the first-named reading counts. That rule produced the one-reader gaps.
  - **The pair:** I gave it the same meaning as the single words. A per-platform design with its own website story was not tested.
- **The decision step needed an interpretation.** The rule's wording, "the top two", did not foresee a five-way near-tie. I applied the tie to every name within the spread of the top. Read literally, the rule picks `builtin`.
- **Nothing was built or run.** "What a visitor gets" is judged against the intended meaning, not against software.

## Files

All paths are relative to `naming/`.

- **`plan.md`:** decision-rule details, framings and answer key, written before data.
- **Prompts:** in `prompts/`. Scorer prompts are `scorer-*.md`.
- **Generators, in `check/`:** `make-blind.mjs`, `make-cold.mjs`, `make-writers.mjs`, `make-rank.mjs`, `make-imports.mjs`.
- **Raw answers:** `blind/raw/`, `cold/raw/` (pages in `cold/pages/`), `writers/raw/` (type sheets in `writers/sheets/`), `rank/raw/`, `imports/raw/`.
- **Scores:** `scores/` (two scorers per step).
- **Tallies, in `check/`:** `tally-blind.py`, `compare-cold.py`, `tally-writers.py`, `tally-rank.py`, `tally-imports.py`.
- **Transcript checks:** `check/extract.py`, with `check/map.tsv` and `check/stage.py`. They confirm that each participant made exactly one Read, of its own prompt file, and no other tool call. 0 problems across 138 participants.
