# Do web developers know what "headless" means for UI libraries? Do "base", "primitives" and "unstyled" compete?

Research date: 2026-11-17. Read-only web research. Quotes are verbatim from the fetched page unless marked otherwise.

- VERIFIED means I fetched the page or API myself and read the text or number.
- UNVERIFIED means it came only from a search-engine summary or a third party, or I could not read the primary source.

Survey numbers in section 1 come from each survey's public `page-data.json`, which holds the raw counts behind the charts. I computed the percentages from those counts. The scratch downloads have been deleted; re-fetch from the URLs below.

---

## 1. Surveys

### 1.1 State of React (Devographics): the only survey with a component-library awareness question

**Format.** Each library is one row with three choices. The survey labels and defines them:

- "Never heard of it": "Respondents who have never heard about an item."
- "Heard of it": "Respondents who have heard about an item, but haven't used it."
- "Used it": "Respondents who have used an item."

These labels come from the 2024 page-data. The section is titled "Component Libraries" in 2023 and 2024, and "UI Libraries" in 2025. The listed rows are not grouped as headless or styled.

**Wording.** The chart itself carries no question sentence. The write-in follow-up is worded: "What other component libraries have you used?"

URLs:

- https://2023.stateofreact.com/en-US/libraries/component-libraries/
- https://2024.stateofreact.com/en-US/libraries/component-libraries/
- https://2025.stateofreact.com/en-US/libraries/component-libraries/

**Results.** Computed from the raw counts in page-data (VERIFIED). Each row has about 10,000 respondents in 2023, 6,300 in 2024 and 2,750 in 2025.

| Library | Year | Never heard | Heard, not used | Used |
|---|---|---|---|---|
| Headless UI (Tailwind) | 2023 | 32.3% | 45.7% | 22.1% |
| | 2024 | 28.1% | 50.0% | 21.9% |
| | 2025 | 23.2% | 54.5% | 22.3% |
| Radix | 2023 | 39.2% | 35.5% | 25.3% |
| | 2024 | 29.7% | 34.2% | 36.1% |
| | 2025 | 18.9% | 33.5% | 47.6% |
| React Aria | 2023 | 51.5% | 37.9% | 10.6% |
| | 2024 | 42.0% | 41.7% | 16.3% |
| | 2025 | 33.7% | 45.9% | 20.4% |
| shadcn/ui | 2023 | 49.3% | 29.9% | 20.8% |
| | 2024 | 22.2% | 35.6% | 42.2% |
| | 2025 | 10.8% | 32.9% | 56.3% |
| MUI (styled, for comparison) | 2023 | 11.4% | 31.1% | 57.5% |
| | 2024 | 9.2% | 33.4% | 57.4% |
| | 2025 | 7.9% | 34.5% | 57.6% |
| Chakra UI (styled) | 2025 | 16.0% | 62.9% | 21.1% |
| Mantine (styled) | 2025 | 51.4% | 35.4% | 13.2% |

**Libraries with no row of their own.** Base UI, Ark UI and Ariakit appear only in the write-in follow-up. In 2025, 221 people answered it (5.9% of the 3,760 respondents):

- Base UI: 49 mentions (22.17% of those 221, 1.3% of the survey)
- Ark UI: 10 mentions
- Ariakit: 7 mentions

**A third party misread the Base UI figure.** Certificates.dev's summary says Base UI is at "22% as an alternative to Radix" (https://certificates.dev/blog/breaking-down-state-of-react-2025-results). That 22% is the share of the 221 write-in answers, which is 1.3% of all respondents. Anyone citing Base UI adoption from that article would overstate it about 17-fold.

**How the survey itself uses the word "headless" (VERIFIED, from the takeaway texts):**

- 2023: "**React Aria** and **Radix** lead the rankings in terms of positivity, proving that the headless approach to component libraries has a lot going for it." This sentence gives no definition.
- 2024: "With the amount of pain caused by **styling & customization** issues, it's no wonder “headless” libraries such as **Radix** and **React Aria** have proven so popular." The scare quotes signal the term is not fully established, but again there is no definition.
- 2025: "**Base UI** is another entrant in the very competitive space of headless UI libraries–in other words UI libraries that provide component behavior, but leave styling up to you." This is the only edition that defines the term, and it does so with a gloss rather than assuming readers know it.

**Library descriptions stored with the survey data (VERIFIED).** These are mostly "unstyled", not "headless":

- React Aria: "A library of unstyled React components and hooks that helps you build accessible, high quality UI components..."
- Ark UI: "Get fully customizable, accessible and unstyled UI components"
- Ariakit: "...lower-level React components and hooks for building accessible web apps, design systems, and component libraries."

**Who answers this survey.** It is not beginner-heavy:

- 2024: 25.3% have 0-4 years of experience, median 8 years.
- 2025: 21.4% have 0-4 years of experience, median 8 years.

Source: https://2025.stateofreact.com/en-US/demographics/ page-data (VERIFIED).

**What this means for awareness.** In a self-selected, experienced React audience in 2025, about 1 in 5 had never heard of Radix and about 1 in 4 had never heard of Headless UI. The survey measures whether people know the brand names. It never asks whether they understand the category word "headless".

### 1.2 State of CSS: shadcn/ui is listed as a "CSS framework"; no headless category

- Question: "Which CSS frameworks do you use?" Section description: "Frameworks and libraries that give you pre-made components or styles." (VERIFIED)
- URL: https://2025.stateofcss.com/en-US/other-tools/
- 2025 results, out of 3,977 who answered (5,506 respondents in total):

| Option | Count | Share of answerers |
|---|---|---|
| Tailwind | 2,041 | 51.3% |
| Bootstrap | 1,194 | 30.0% |
| custom or in-house framework | 953 | 24.0% |
| shadcn/ui | 766 | 19.3% (13.9% of the whole survey) |

- In 2024, shadcn/ui appeared only as a write-in: 55 mentions, 1.12% of answerers.
- Radix, Headless UI, React Aria and Base UI do not appear in State of CSS 2024 or 2025 tools data.
- The word "headless" does not appear in either year's data. I searched the page-data for "headless", "radix", "base_ui", "react_aria" and "unstyled".

### 1.3 State of JS 2024 and 2025: no component-library question

- The library sections are front-end frameworks, meta-frameworks, back-end frameworks, build tools, testing, and in 2024 also mobile/desktop and monorepo tools.
- In the "other tools" page-data, "headless" appears only in two places, neither about UI components (VERIFIED):
  - Puppeteer's description, "Headless Chrome Node.js API" (2024): https://2024.stateofjs.com/en-US/other-tools/
  - A sponsor blurb for Storyblok, "Storyblok is a Headless CMS that works with all modern frameworks..." (2025): https://2025.stateofjs.com/en-US/other-tools/
- So inside the largest JS survey, the only uses of "headless" are the browser meaning and the CMS meaning.

### 1.4 Other surveys

- **The Software House, State of Frontend 2024** (6,028 respondents). UNVERIFIED: search summary only, I did not open the report. It reportedly asked "What's your favorite design system solution?" and found shadcn/ui 28.1%, MUI 21.6%, Bootstrap 11.6%. That is a preference question with no headless category reported. https://tsh.io/state-of-frontend
- **Stack Overflow Developer Survey:** I did not check its question list for component libraries. Status: UNVERIFIED / not researched.

---

## 2. Beginner questions and confusion

### Hacker News, 5 Nov 2021

The thread is "React Aria: A headless UI component library" (https://news.ycombinator.com/item?id=29116450). The sub-thread starts with a question (https://news.ycombinator.com/item?id=29116806), VERIFIED:

- deltaci asked: "can someone explain in layman terms what is headless UI?"
- Replies:
  - jokull: "Bring your own UI"
  - zettadam: "'headless' means you bring your own html structure, the library provides interaction and state exposed by props or hooks."
  - zettadam: "I am not sure Headless UI is headless since they only let you bring your own CSS."
  - nsonha: "It's not a thing, this is just a term made up on the spot by the author of this article"
  - andrewingram: "it's been floating around for years to describe this exact concept."
  - spyke112: "Why not just use default html elements?"
- This is the clearest direct evidence of three things: people asked what the term means, experienced commenters disagreed on its definition (hooks only, or unstyled components), and one rejected the term outright.
- Vote counts are not shown on Hacker News comments.

### Hacker News, "Headless React" (acko.net)

https://news.ycombinator.com/item?id=27750864, comment 27752460. UNVERIFIED (search summary only). A commenter reportedly defines "A headless component is one that does not return anything for a render by default..." Others reportedly note that the article's "Headless React" means something else: React semantics with no rendering. So the same phrase was used in two senses in one thread.

### Stack Overflow (Stack Exchange API, VERIFIED, 17 Nov 2026)

I found no "what is a headless component" question. Searching for "headless component" by votes returns Chrome DevTools, Spring, Vagrant, Strapi and Puppeteer questions.

Question counts by phrase, in full-text search:

| Phrase | Questions |
|---|---|
| "headless chrome" | 1,418 |
| "headless browser" | 1,395 |
| "headless cms" | 576 |
| "headless ui" (mostly the Tailwind product name) | 124 |
| "headless component" | 5 |

Tag counts:

| Tag | Questions |
|---|---|
| headless | 1,209 |
| google-chrome-headless | 1,184 |
| headless-browser | 755 |
| shadcnui | 389 |
| headless-cms | 225 |
| headless-ui | 167 |
| radix-ui | 103 |
| react-aria | 24 |
| base-ui | 1 |

Tag wiki excerpts:

- `headless`: "Headless systems are those which do not support standard user interface devices, such as monitors, keyboards and mice."
- `headless-ui`: "Headless UI – Unstyled, fully accessible UI components". Here "headless" is the product name, defined by "unstyled".
- `base-ui`: "...a library of unstyled React UI components and low-level hooks. This open-source project is maintained by MUI."

The Headless UI questions with the most votes are how-to questions, not definition questions. Examples: "Headless UI Dropdown - Open menu above the button" (2022, score 21, 19.5k views) and "Don't close Dialog(Modal) when click outside in React & HeadlessUI" (2021, score 16, 32k views).

### GitHub issue search (VERIFIED)

Issues and PRs titled "What is headless..." are about other meanings:

- "What is Headless Chrome?" (2017)
- "What is headless mode?" (2018)
- "What is Headless CMS?..." (2021)
- "What exactly does 'headless' mean in your case." (2016, ogre-headless-renderer)

None of the top results asks about headless UI.

### mui/base-ui issue #1176, 19 Dec 2024 (VERIFIED)

https://github.com/mui/base-ui/issues/1176

- Title: "What are the differences between @base-ui-components/react and @mui/base?"
- Body: "I couldn't find the document addressing this question. They are both named 'Base UI' and hosted by mui organisation."
- Maintainer reply: "it's just `@base-ui-components/react` going forward, `@mui/base` is no longer maintained". Two comments, two reactions.

### DEV posts framed as "which layer is which"

- "What is the difference between Radix UI and shadcn?" (17 Sep 2024, 0 comments): https://dev.to/swhabitation/what-is-the-difference-between-radix-ui-and-shadcn-55fk
- "shadcn vs Radix vs Base UI: Which One Should a Junior Pick in 2026?" (3 May, year shown only as 2026 in the footer; 1 comment): https://dev.to/edriso/shadcn-vs-radix-vs-base-ui-which-one-should-a-junior-pick-in-2026-1jml. It says "the difference is small for a junior". It does not claim juniors are confused.
- UNVERIFIED (search summary only): 21st.dev reportedly calls "Radix or shadcn" "a bit of a category error". https://21st.dev/blog/radix-base-ui-shadcn

### Reddit (r/reactjs, r/webdev, r/Frontend, r/learnprogramming): NOT VERIFIED

Reddit blocked both the JSON search API and old.reddit fetches. Web search returned no Reddit threads for "what is headless ui", "headless vs unstyled" and similar queries. I make no claim about Reddit either way.

### YouTube

- I found no video titled exactly "What is Headless UI" in search results.
- Found: "Using Tailwind CSS's Headless UI for React" (https://www.youtube.com/watch?v=CkIixGA1LqI). UNVERIFIED: title and date only, from search results.
- Found: Laracasts "Learn Headless UI" (4 episodes, updated 4 Sep 2021). UNVERIFIED: search summary only.

---

## 3. How docs and articles explain "headless"

Nine definitions, VERIFIED unless marked.

1. **Headless UI (Tailwind) home page**, https://headlessui.com/
   - "Completely unstyled, fully accessible UI components, designed to integrate beautifully with Tailwind CSS."
   - The product named "Headless" defines itself only as "unstyled". The launch post (6 Oct 2020) never explains the word "headless": https://tailwindcss.com/blog/headless-ui-unstyled-accessible-ui-components
2. **Base UI npm description**, `@base-ui/react` 1.9.0, VERIFIED via the npm registry
   - "Base UI is a library of headless ('unstyled') React components and low-level hooks."
   - "unstyled" is used as the parenthetical gloss for "headless". The deprecated `@mui/base` carries the same text with "MUI Base".
3. **Base UI About page**, https://base-ui.com/react/overview/about
   - "Base UI is an unstyled React component library for building accessible user interfaces."
   - "Headless" appears only as a section heading.
4. **Radix Primitives introduction**, https://www.radix-ui.com/primitives/docs/overview/introduction
   - "Radix Primitives is a low-level UI component library with a focus on accessibility, customization and developer experience."
   - "Unstyled" is a section heading. The word "headless" does not appear on the page.
5. **Ark UI**, https://ark-ui.com/
   - Tagline: "Unstyled UI components for your Design System"
   - "A headless library with 45+ accessible components."
   - "Truly Headless: No default styles to fight. Bring your own CSS..."
6. **React Aria**, https://react-aria.adobe.com/
   - "React Aria is style-free out of the box..."
   - "Get complete control with hooks."
   - "headless" appears only in the page's meta keywords.
7. **Martin Fowler's site, by Juntao Qiu**, 7 Nov 2023, https://martinfowler.com/articles/headless-component.html
   - "A Headless Component is a design pattern in React where a component ... is responsible solely for logic and state management without prescribing any specific UI"
   - The same article also uses "headless CI/CD servers" and "headless Chrome" in their usual senses.
8. **LogRocket, by Elijah Asaolu**, 18 Dec 2023, https://blog.logrocket.com/exploring-shift-css-in-js-headless-ui-libraries/
   - "These components are "headless" in that they don't come with a specified style."
9. **Adam Argyle, "Headless, boneless, skinless & lifeless UI"**, 16 Oct 2024, https://nerdy.dev/headless-boneless-and-skinless-ui
   - "Headless: Working components; BYO (bring your own) style."
   - "Headless doesn't quite match what you get IMO, since these totally have a brain, muscle and structure."
   - Skinless: "This is like headless UI but is unstyled; functioning bones."
   - A Chrome DevRel author says the word is a poor fit, and proposes that "unstyled" belongs to a different category than "headless".

Further definitions from secondary sources:

- **components.build definitions page**, https://www.components.build/definitions
  - "A primitive (or, unstyled component) is the lowest-level building block that provides behavior and accessibility without any styling."
  - "Primitives are completely headless (i.e. unstyled)"
  - This collapses primitive, headless and unstyled into one meaning.
- **Aurora Scharff for Certificates.dev**, 24 Dec 2025, https://certificates.dev/blog/starting-a-react-project-shadcnui-radix-and-base-ui-explained
  - "Unstyled component libraries solve this by providing the behavior and accessibility logic without any styling."
  - The article never uses "headless". It says "Radix primitives render with zero styling."
- **usertourkit.com FAQ**, undated, references April 2026, https://usertourkit.com/blog/what-is-headless-ui
  - "A headless CMS separates content storage from frontend rendering..."
  - "A headless UI component separates interaction logic from visual rendering."
  - "When React developers say [headless UI], they mean the component pattern."

**Words used to define "headless".** Across these sources:

- "unstyled" is the most common, as in Headless UI, Base UI, the components.build definitions page and the Stack Overflow tag wiki.
- Others are behavior or logic, "low-level", "hooks", "style-free", "bring your own (UI/CSS/style)", and "primitives".

There are two competing scopes:

- **Narrow:** hooks or state only, you bring the markup. Examples are zettadam on Hacker News and Fowler.
- **Broad:** components with markup and behavior but no CSS. Examples are Headless UI, Radix and Base UI.

---

## 4. Other meanings of "headless"

**Wikipedia "Headless" disambiguation page** (VERIFIED via API). Under Computing it says: "headless can either refer to software or servers without a graphical interface, or software platforms that decouple front- and back-end components."

- It lists Headless computer, Headless software, Headless browser and Headless CMS.
- It has no headless UI or headless component entry. There is no "Headless UI" article (pageviews API: Not Found).

**Wikipedia pageviews**, registered and anonymous users, Nov 2025 to Oct 2026 (VERIFIED via the Wikimedia API). This is a rough public-interest proxy, not Google Trends:

| Article | Views |
|---|---|
| Headless browser | 29,261 |
| Headless content management system | 12,571 |
| Headless computer | 10,236 |
| Headless software | 8,045 |
| Headless commerce | 5,813 |
| Headless UI | no article |

**npm weekly downloads**, 10-16 Nov 2026 (VERIFIED via the npm API). These measure installs, not understanding, and include CI and transitive installs:

| Package | Weekly downloads |
|---|---|
| playwright | 175.3M |
| puppeteer | 15.5M |
| @radix-ui/react-dialog | 98.0M |
| @base-ui/react | 31.0M |
| radix-ui | 29.4M |
| @headlessui/react | 9.9M |
| react-aria-components | 9.6M |
| @ark-ui/react | 1.5M |
| baseui (Uber) | 123k |

**Google Trends: NOT VERIFIED.** The Trends API returned HTTP 429, and I found no published chart comparing "headless UI" with "headless CMS" or "headless browser". UNVERIFIED: a semurai.pl article reportedly shows a Trends chart for "headless CMS" alone. I report no Trends numbers.

**Evidence of the meanings mixing:**

- State of JS uses "headless" only for Puppeteer and a headless CMS sponsor (section 1.3).
- Stack Overflow is dominated by the browser meaning (section 2).
- GitHub "What is headless..." titles are all browser, CMS or renderer questions (section 2).
- Explainers feel they must separate the meanings, for example the usertourkit FAQ (section 3).
- Netlify on headless CMS: "This means the term “headless” is a bit of a misnomer." (https://www.netlify.com/blog/complete-guide-to-headless-cms/)
- I found no first-hand quote of someone confusing a headless UI library with a headless CMS or browser. The evidence shows the meanings sit side by side and are explained apart. It does not show anyone actually mixing them up.

---

## 5. Competing meanings of "base", "primitives" and "unstyled"

### "base"

**Tailwind CSS: "base" means reset or default element styles.** Tailwind is the most-used CSS framework in State of CSS 2025 at 51%. https://tailwindcss.com/docs/preflight

- "Preflight is a set of base styles for Tailwind projects..."
- "When you import `tailwindcss` into your project, Preflight is automatically injected into the `base` layer"
- "If you'd like to add your own base styles on top of Preflight, add them to the `base` CSS layer in your CSS using `@layer base`"
- v3: `@tailwind base` "injects Tailwind's base styles and any base styles registered by plugins." (https://v3.tailwindcss.com/docs/functions-and-directives)

**MUI's Base UI: the product name.** The name itself has a history:

- Launched as "MUI Base" (blog, 7 Sep 2022): "an entirely new library of headless React UI components and hooks called MUI Base". https://mui.com/blog/introducing-base-ui/
- Renamed "Base UI" for the `@mui/base` beta, about 2023. UNVERIFIED: from an X post as summarized by search.
- Renamed back to "MUI Base" for the legacy package when the new `@base-ui-components/react` took the name. VERIFIED by GitHub issue #44910 and PR #45060 titles, "[docs] Rename "Base UI" to "MUI Base" in all text".
- Today `@mui/base` is deprecated: "This package has been replaced by @base-ui/react". VERIFIED via npm.
- Within one organization, the same two words have named two different packages.

**Uber's Base Web: npm package `baseui`, a styled design system.**

- README: "**Base** is a design system comprised of modern, responsive, living components. Base Web is the React implementation of Base." ... "On npm, you can find Base Web as `baseui`." https://github.com/uber/baseweb
- npm description: "A React Component library implementing the Base design language".
- Uber's own v5 docs called it "Base UI": "Base UI is a project created and maintained by the UI and Design Platform teams at Uber." https://v5.baseweb.design/getting-started/comparison/
- So "Base UI" has named a styled Uber library as well as MUI's unstyled one, and the unscoped npm name `baseui` belongs to Uber.

**"base" in design tokens.** It means the lowest layer of raw values.

- Andreas Kutschmann on martinfowler.com (12 Dec 2024): option tokens are "also called primitive tokens, base tokens, core tokens, foundation tokens or reference tokens". https://martinfowler.com/articles/design-token-based-ui-architecture.html
- GitHub Primer's token package is called "Primer Primitives". Its CSS sits under `dist/css/base/...` next to `functional`. https://primer.style/foundations/primitives/getting-started
- So "base" and "primitive" are synonyms for the same token tier there, and neither means a component.
- UNVERIFIED (search summary only): the Mews design system lists "global tokens, base tokens" as alternative names for primitive tokens.

**shadcn/ui uses "base" both ways.**

- Base UI became the default on 2-3 Jul 2026: "Base UI as the Default", https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default. The page title is VERIFIED via search; the details are UNVERIFIED (search summary only).
- Component URL paths use `/docs/components/base/...` (VERIFIED).
- UNVERIFIED (search summary only): registries use a `registry:base` config to pin the primitive library.

**Base class (object-oriented programming).** I did not fetch a source in this pass; the meaning is general knowledge. Status: UNVERIFIED here.

### "primitives"

- **JavaScript.** MDN: "In JavaScript, a primitive (primitive value, primitive data type) is data that is not an object and has no methods or properties." The 7 types are string, number, bigint, boolean, undefined, symbol and null. https://developer.mozilla.org/en-US/docs/Glossary/Primitive
- **Radix Primitives, the product name.** "Radix Primitives is a low-level UI component library..." (section 3, #4).
  - UNVERIFIED (search summary only): tastefulkit.com warns readers to tell Radix Primitives apart from the styled Radix Themes.
- **Layout primitives.** Atlassian: primitives are "composable components that provide opinionated solutions to common design and layout problems". Box is "A generic container with managed access to design tokens." https://atlassian.design/foundations/spacing/primitives
  - These are styled, token-aware layout pieces, not unstyled interactive widgets.
  - UNVERIFIED (search summary only): Every Layout's "Stack, Box, Center, Cluster..." primitives.
- **Design-token primitives.** Figma: "Primitive tokens tell us what properties and values exist within our designs." "Sometimes known as global tokens..." https://help.figma.com/hc/en-us/articles/18490793776023-Update-1-Tokens-variables-and-styles
- **shadcn changelog, Aug 2026.** "The `<Questionnaire />` component is also available as an unstyled headless primitive in `@shadcn/react`." Three of the words in one phrase. https://ui.shadcn.com/docs/changelog

### "unstyled"

- **Flash of unstyled content (FOUC).** Wikipedia: "a web page appears briefly with the browser's default styles prior to loading an external CSS stylesheet". Here "unstyled" means browser defaults, not "you style it".
  - Stack Overflow has 163 questions with "unstyled" in the title and 106 with "FOUC" in the title (VERIFIED via API). The top-voted "unstyled" titles are FOUC and "Flash Of Unstyled Text" questions.
- **The library sense.** Headless UI, Base UI, Ark and React Aria use it to mean "ships no CSS, you add yours" (section 3).
- **Argyle** separates "unstyled" (skinless) from "headless" (section 3, #9).
- **components.build** and the Base UI npm description make them identical (section 3).

---

## Summary

### What the evidence says

1. **Developers know the brands, not necessarily the category word.**
   - In State of React 2025 (median 8 years' experience, about 21% with 0-4 years), Radix had been used by 48% and was unknown to 19%.
   - Headless UI: used by 22%, unknown to 23%.
   - React Aria: used by 20%, unknown to 34%.
   - shadcn/ui: used by 56%, unknown to 11%.
   - Base UI had no row of its own. It was a write-in for 1.3% of respondents. A widely shared "22%" figure is a misreading of the write-in share.
2. **The surveys themselves treat "headless" as needing explanation.**
   - State of React put it in scare quotes in 2024 and glossed it in 2025: "UI libraries that provide component behavior, but leave styling up to you".
   - State of CSS files shadcn/ui under "CSS frameworks".
   - State of JS has no component-library question, and uses "headless" only for Puppeteer and a headless CMS.
3. **"What is headless UI?" is a real question, and even experts disagree on the answer.**
   - The clearest record is Hacker News, Nov 2021: one person asked for a layman's definition, one commenter said Tailwind's Headless UI is not truly headless, and another called the term made up.
   - Adam Argyle (2024) says the word "doesn't quite match".
4. **"Headless" is defined through "unstyled" almost everywhere.** This includes the Headless UI tagline, the Base UI npm description "headless ('unstyled')", and the Stack Overflow tag wiki. The library ecosystem treats the two words as near-synonyms, while a minority of authors separate them: hooks-only versus unstyled components, or headless versus skinless.
5. **Other meanings of "headless" dominate general developer channels.** Headless browser and Chrome questions outnumber headless UI questions about 20:1 on Stack Overflow. Wikipedia's disambiguation page lists computer, software, browser and CMS but not UI. Every top GitHub "What is headless..." title is about a browser, CMS or renderer.
6. **"Base" is heavily overloaded in exactly this audience's tools.**
   - Tailwind's `base` layer means reset styles.
   - "Base UI" has named MUI's deprecated `@mui/base`, MUI's current `@base-ui/react`, and Uber's styled Base Web, which owns the npm name `baseui`.
   - Design tokens use "base tokens" for raw values.
   - shadcn uses "base" both for the library choice and in URL paths.
   - An actual user filed a GitHub issue because two packages were "both named 'Base UI'".
7. **"Primitives" is also overloaded.** It names JavaScript value types (MDN), a product (Radix Primitives), styled layout components (Atlassian Box and Stack), and the raw-value token tier (Figma, Primer), where it is a synonym of "base".
8. **"Unstyled" has a second, older web meaning:** browser-default rendering, as in FOUC.

### What the evidence does not show

- **No direct measure of whether beginners understand "headless".** No survey I found asks what the term means. State of React measures brand awareness among experienced developers, and it is self-selected.
- **No Reddit evidence either way.** Reddit was not reachable.
- **No first-hand quote of someone confusing headless UI with a headless CMS or browser.** I found only that the meanings coexist and that explainers feel they must separate them.
- **No Google Trends data.** I was rate-limited and found no published comparison. The Wikipedia pageviews and npm numbers are weak proxies.
- **Not checked:**
  - State of Frontend 2024 figures (search summary only)
  - The Stack Overflow Developer Survey
  - YouTube view counts
  - The OOP "base class" meaning (no source fetched)
- **The confusion cases are small.** Most are single threads or issues with few comments. They show the confusion exists, not how common it is.
