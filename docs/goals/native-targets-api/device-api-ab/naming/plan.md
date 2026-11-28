# Naming test: plan, decision rule and answer key

Written before any participant ran. Nothing here changes after data arrives; anything that had to change is listed in the report as a change.

## What is being named

Markup for the platform's own UI: the platform's real sheet (the author's markup inside the platform's frame, drag and motion), the camera preview, a PDF view, the platform's tab bar, the platform's menu. On the web it is the browser's own equivalent where one exists. It sits beside the headless `@markless/ui` families (`drawer`, `modal`, `tabs`), which the author draws and which look the same on each platform.

## Candidates

`system`, `native`, `os`, the per-platform pair `ios`/`android`, plus the top three new names from the blind writers that meet the constraints (lowercase, no separators, not `platform`, `device`, `base`, not a `@markless/ui` family name, not a name already ruled out with a stated reason).

How the per-platform pair is tested. The meaning stays fixed for every candidate, so the pair has to express the same thing: the page writes the `ios` tag and the `android` tag side by side, each build renders the one for its platform, and the website build renders the browser's own equivalent once. Writers get one sentence that says the first half ("write the `ios` and the `android` element side by side; each app build renders the one for its platform"), because without it the pair cannot be used at all. Nothing about the website is said for any candidate.

## Framings

Step 1 (blind naming): web developer who has never built a phone app; iOS or Android developer; React Native or Expo developer. 8 each.

Steps 3, 5, 6 (readers): web developer; phone-app developer. Half each.

## Cold reader answer key (step 3)

The page is `cold/pages/<candidate>.tsrx`. Six questions.

1. **What is `X`?** A set of Markless elements, each of which is the platform's own built-in UI: the operating system's on a phone, the browser's on the web. Recorded, scored right or wrong, and the source of most wrong meanings.
2. **Where does it come from?** A Markless package (the import line). Recorded only.
3. **Who decides how the sheet looks?** (decision part a) The platform: iOS draws an iOS sheet, Android an Android sheet, the browser on the web. The author supplies only what is inside. Right if the answer puts the look (frame, motion, drag) with the platform, operating system or browser. Wrong if the author, CSS, Markless's own styles or a theme decide it, or "cannot tell".
4. **What does a website visitor get for each tag?** (decision part b) `X.sheet`: the browser's own equivalent, a modal dialog (`<dialog>`). `X.camera`: the browser's own camera preview (a `<video>` fed by the browser's camera access). `X.pdf`: the browser's built-in PDF viewer. Right only if, for all three tags, the answer says the visitor gets a working version supplied by the browser. Wrong if any tag gives nothing, is removed, throws, is an error, is a Markless- or author-drawn stand-in, or "cannot tell". A per-tag tally is reported as well, and a lenient tally (some working equivalent, whoever draws it).
5. **How is `X.sheet` different from `drawer`?** (decision part c) `X.sheet` is the platform's own sheet, so it looks and moves differently on each platform and the author does not style its frame; `drawer` is drawn by the author (headless, styled by the page) and looks the same everywhere. Right if both halves are present in substance.
6. **Would you expect `X.button` to exist?** Not scored. Recorded as yes, no or maybe, with the reason. Expected by the design: probably not, because a plain `<button>` already is the platform's button.

**Fully right** = parts a, b and c all right.

**Wrong meaning of its own:** an answer that gives the name a meaning that is not the intended one and that comes from the word itself, for example "design system", "the built-in HTML element", "phones only, nothing on the web", "operating-system calls such as files or processes", "Node's `os` module", "iOS-styled components drawn by Markless". Recorded verbatim with the question it appeared in. One reader counts once per distinct wrong meaning, and a reader with any wrong meaning counts once toward disqualification.

## Decision rule (fixed in the brief, made exact here)

1. **Score.** For each candidate, the share of its cold readers fully right, per framing (3 readers each), then the mean of the two framing shares.
2. **Disqualify** a candidate when more than 1 in 5 of its cold readers gives a wrong meaning of its own: with 6 readers, 2 or more.
3. **Winner:** the highest score among the candidates left.
4. **Tie:** the top two are within the spread between readers of the same name when their scores differ by one reader or less (1/6, since each framing has 3 readers and the score is the mean of the two). Then the name more blind writers proposed wins (counting any of a writer's three proposals). If that is equal too, the report says it is a tie and recommends the name prior art supports (`~/reports/native-naming.md` ranks `system`, then `native`, then `os`).

Scoring: two scorers mark every reader against this key independently; a third settles each mark they disagree on.

## Writers (step 4)

Five per candidate. Four tasks: a filter sheet that must look and move like the phone's own sheets; a "What's new" panel drawn to a designer's spec, the same everywhere; a receipt-scan page with a live camera preview; an invoice PDF viewer. Counted per answer:

- **Wrong kind:** the platform's element used for the designed panel, or `drawer` (or another hand-drawn stand-in) used for the platform-look filter sheet, or a hand-built `<video>`/`<iframe>` where the platform's element was the fit.
- **Names used wrongly:** a guard or fallback that assumes the platform's element does not exist on the web (for example `@if (platform !== 'web')` around it, or a separate website version), styling of the platform sheet's frame, members of `X` that the sheet does not declare.

## Ranking (step 5)

Twelve fresh readers, 6 per framing, each see the step 3 page once per candidate, in an order shuffled per reader (seeded, recorded in `check/rank-orders.txt`), and rank them for clarity with a reason. Secondary to step 3.

## Import line (step 6)

Winner and runner-up, three lines each (`@markless/<name>`, `@markless/ui`, `@markless/device`), 6 cold readers per line (3 per framing). Each reader sees the import line and the five usage lines and answers what they assume the package contains, what else they expect in it, and what they would not expect. Scored: assumes it holds the platform's own UI elements (right) or something else (recorded verbatim).
