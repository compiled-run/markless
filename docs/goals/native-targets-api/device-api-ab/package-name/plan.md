# Package-name test: plan, decision rule and answer key

Written before any participant ran. Nothing here changes after data arrives; anything that had to change is listed in the report as a change.

## What is being named

The package that today is `@markless/ui` (source `packages/headless/components`). It holds families such as `tabs`, `modal`, `drawer`, `collapsible`, `calendar`, `datebox`, plus a `base` namespace of single pieces (`base.button`, `base.label`, `base.separator`). It supplies behaviour, accessibility and parts with no styling; the author draws everything; it works the same on the web, iOS and Android. Platform-drawn pieces are `native.*` from `@markless/device` (phone builds only).

## Candidates

`ui` (keep), `headless`, `base`, `primitives`, `unstyled`, `components`, `kit`, `parts`, `elements`, plus the top three new names from the 24 blind namers (most writers proposing it, counting any of a writer's three proposals; ties broken by the number of first choices) that are lowercase, have no separators, and do not collide with a Markless package name. Taken package names, from the repo's `package.json` files: `analyzer`, `bundler`, `compiler`, `core`, `router`, `runtime`, `serializer`, `typescript-plugin`, `vitest-browser`, `web`, `icons`, `ui-tools`, plus `device` (the A/B design). None of the nine listed candidates collides.

`base` extra pages: `base` (the standard page: `import { tabs, modal, base } from '@markless/base'`, the collision) and `base-<inner>`, where the inner namespace is renamed to the blind namers' top proposal for the single-pieces namespace other than `base`.

## Framings

Blind naming: web developer one year in (beginner), experienced web developer, mobile developer. 8 each.

Cold readers and rankers: beginner and experienced web developer. Half each.

## Cold reader answer key

The page is `cold/pages/<candidate>.tsrx`. Seven questions.

1. **What is in `@markless/<name>`?** (fully-right part a) Ready-made interface pieces (components, parts, building blocks) for things like tabs, modals and buttons, with their behaviour and accessibility. Right if the answer is a set of UI components or component parts. Wrong if it is something else: styles, a CSS reset or theme, a design system that mainly ships a look, utility functions, the framework core, server or CMS code, a headless browser, or "cannot tell".
2. **Does it come styled?** (part b) No: it has no visual styles; the author styles everything. Right if the reader's leaning answer is "unstyled" or "no visual styling, I style it". "Minimal default styles", "probably styled", "a default theme" and "cannot tell" are wrong.
3. **Does it work on phones?** (part c) Yes: the same pieces work in the iPhone app, the Android app and the website. Right if the leaning answer is yes in the phone apps. Wrong if web only, phones only through a web view described as unsupported, or "cannot tell".
4. **Where would you look for a date picker?** In this package (a family of its own). Scored right or wrong, reported, not part of fully right.
5. **How is it different from `native.*`?** `native.*` is drawn by the platform and looks different per platform; this package's pieces are drawn by the author and look the same everywhere. Right if both halves are present in substance. Reported, not part of fully right.
6. **What would you expect `@markless/ui` to be if it existed beside this package?** Recorded verbatim, not scored. For the `ui` candidate the question reads "What would you expect a second package named `@markless/components` to be if it existed beside this one?", recorded only.
7. **What is `base` (or the renamed inner namespace)?** Single standalone pieces (button, label, separator) with the same unstyled behaviour. Right if it reads as a group of small single elements inside this package. Wrong if it reads as the whole package again, base styles or a reset, a base class to extend, or "cannot tell". Reported, not part of fully right; used for the `base` collision test.

**Fully right** = parts a, b and c all right.

**Wrong meaning of its own:** an answer that gives the package name a meaning that is not the intended one and that comes from the word itself, for example "base styles / CSS reset", "a base class", "a headless CMS or headless browser", "server-rendered or no UI at all", "a styled kit / starter template", "HTML elements", "the framework's core". Recorded verbatim with the question it appeared in. A reader with any wrong meaning counts once toward disqualification. A plain wrong guess about styling that the reader does not tie to the word is a 0 on part b, not a wrong meaning.

Hedged answers: the reading the reader says they lean to counts; if none, the first named.

## Decision rule (fixed in the brief, made exact here)

1. **Score:** for each candidate, the share of its cold readers fully right, per framing (3 readers each), then the mean of the two framing shares.
2. **Disqualify** a candidate when more than 1 in 5 of its cold readers gives a wrong meaning of its own: with 6 readers, 2 or more.
3. **Winner:** the highest score among the candidates left.
4. **Tie:** candidates whose score is within one reader (1/6) of the top score are tied. Ties go to the name the real-world evidence in Part 1 supports. The report states that reading of the evidence and says explicitly where Part 1 and Part 2 disagree.

Scoring: two scorers mark every reader against this key independently; a third settles each mark they disagree on.

## Ranking

Twelve fresh readers, 6 per framing. Turn 1, before seeing any page: "you need tabs and a modal in a Markless app; what do you type after `pnpm add @markless/`?" (open guess, top three). Turn 2: the same page once per candidate (the `base` collision page stands for `base`), shuffled per reader with a fixed seed (recorded in `check/rank-orders.txt`). Rank all for clarity (easiest to tell what the package holds, that it is unstyled and that it works on phones), then pick which package name they would try first when installing. Secondary to the cold readers.

## Part 1

Collected by three research subagents with web access and checked by me against the sources where marked. Every claim carries a link and an exact quote, or is marked unverified.
