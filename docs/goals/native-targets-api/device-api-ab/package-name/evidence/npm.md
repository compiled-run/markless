# npm research: download numbers, word counts, suffix meanings

Measured 2026-11-17 (US time; registry timestamps read 2026-11-18T03:4xZ). Raw responses and scripts are in `/tmp/pkgname/research/raw/` and `/tmp/pkgname/research/scripts/`.

## 1. Weekly downloads

Source for every row: `curl -s https://api.npmjs.org/downloads/point/last-week/<pkg>`.
Every response returned the same date range: **start 2026-11-10, end 2026-11-16** (Mon to Sun, inclusive).

| Library | Package | Weekly downloads | Notes |
|---|---|---:|---|
| Radix | `radix-ui` | 29,382,813 | the combined package |
| Radix | `@radix-ui/react-dialog` | 98,025,501 | |
| Radix | `@radix-ui/react-tabs` | 79,493,703 | |
| Base UI | `@base-ui/react` | 31,004,435 | the current name, v1.9.0 (`npm view @base-ui/react version`) |
| Base UI | `@base-ui-components/react` | 1,206,791 | deprecated: "Package was renamed to @base-ui/react" (`npm view @base-ui-components/react deprecated`) |
| MUI Base | `@mui/base` | 4,603,912 | deprecated: "This package has been replaced by @base-ui/react" (`npm view @mui/base deprecated`) |
| Headless UI | `@headlessui/react` | 9,869,125 | |
| Headless UI | `@headlessui/vue` | 3,354,944 | |
| React Aria | `react-aria` | 17,479,663 | |
| React Aria | `react-aria-components` | 9,550,449 | |
| Ark UI | `@ark-ui/react` | 1,489,280 | |
| Zag | `@zag-js/core` | 2,342,855 | |
| Ariakit | `@ariakit/react` | 2,206,593 | |
| Kobalte | `@kobalte/core` | 6,054,988 | |
| Melt UI | `@melt-ui/svelte` | 177,615 | the older line (v0.86.6, not deprecated) |
| Melt UI | `melt` | 15,475 | "The next generation of Melt UI. Built for Svelte 5." (v0.44.0) |
| Bits UI | `bits-ui` | 1,824,142 | |
| Reka UI | `reka-ui` | 3,104,502 | |
| Reka UI | `radix-vue` | 2,721,345 | the old name for Reka; not marked deprecated (`npm view radix-vue deprecated` printed nothing) |
| Qwik UI | `@qwik-ui/headless` | 8,058 | |
| Qwik UI | `@qwik-ui/styled` | 657 | |
| Angular CDK | `@angular/cdk` | 5,548,744 | |
| ng-primitives | `ng-primitives` | 36,870 | |
| shadcn | `shadcn` | 18,592,003 | the CLI |
| Tamagui | `tamagui` | 303,704 | |
| Chakra | `@chakra-ui/react` | 2,222,662 | |
| Mantine | `@mantine/core` | 3,681,216 | |
| daisyUI | `daisyui` | 1,440,993 | |

Caveat: download counts include CI installs, mirrors and transitive installs. Per-part Radix packages (`react-dialog`, `react-tabs`) count higher than `radix-ui` because shadcn-generated code and other libraries depend on them directly.

## 2. How many npm packages use each word

### 2a. Registry search totals (search matches, NOT name matches)

Command: `curl -s "https://registry.npmjs.org/-/v1/search?text=<word>&size=1"`, reading `total`.

The search `total` counts packages where the word matches **anywhere the search engine indexes**: name, description, keywords (and possibly README text). So it measures how often the word shows up, not how many packages carry it in their name.

| Word | Search `total` |
|---|---:|
| headless | 32,159 |
| primitives | 23,056 |
| unstyled | 2,626 |
| base | 133,916 |
| ui | 319,872 |
| components | 319,605 |
| kit | 49,407 |

`text=name:<word>` is **not supported**: `curl -s "https://registry.npmjs.org/-/v1/search?text=name:headless&size=1"` returned `"total":0` for every word, so it cannot be used.

### 2b. Name matches inside the first page window of search results (lower bound only)

The search API only pages to `from=5000` (`size=250`); asking for `from=5250` or above wraps back to the first page (checked by comparing first names). Script: `/tmp/pkgname/research/scripts/page.py <word>`, which walks `https://registry.npmjs.org/-/v1/search?text=<word>&size=250&from=0..5000`.

"substring" = the word appears anywhere in the package name; "token" = the word is a whole name segment split on `@ / - . _` (so `ui` does not match `build`).

| Word | Results retrieved | Names containing it (substring) | Names containing it (whole segment) |
|---|---:|---:|---:|
| unstyled | 2,626 of 2,626 (complete) | 72 | 72 |
| headless | 5,250 of 32,159 | 860 | 840 |
| primitives | 5,250 of 23,056 | 606 | 596 |
| base | 5,250 of 134k | 2,545 | 2,414 |
| ui | 5,250 of 320k | 4,026 | 3,736 |
| components | 5,250 of 320k | 1,870 | 1,827 |
| kit | 5,250 of 49k | 3,600 | 3,276 |

Only the `unstyled` row is exact. The others are lower bounds: name matches still show up in the last 1,000 retrieved results (for `headless`, 117 of them; for `primitives`, 69), so more exist beyond the window.

### 2c. Name-only counts across every npm package name (full scan)

Method: I walked the whole registry name index at `https://replicate.npmjs.com/_all_docs?limit=10000&startkey="<last key>"`, 10,000 names per page, from the first name to the last. Script: `/tmp/pkgname/research/scripts/scan.py`. Output: `raw/allnames.txt`, with **4,619,146 unique names** (the endpoint reported `total_rows` 4,619,162, which was still growing during the scan). 1,852,563 of them are scoped (`@scope/name`). Counts come from `/tmp/pkgname/research/scripts/count.py raw/allnames.txt` (output in `raw/counts.json`).

Columns: "substring" = the word appears anywhere in the name; "whole segment" = the name, split on any non-letter, non-digit character, has the word as one piece (`@x/react-ui` counts for `ui`, `build` does not); "`@x/<word>`" = a scoped package whose unscoped part is exactly the word.

| Word | Substring | Whole segment | `@x/<word>` exactly |
|---|---:|---:|---:|
| headless | 1,532 | 1,358 | 129 |
| primitives | 1,151 | 1,048 | 293 |
| unstyled | 78 | 78 | 5 |
| base | 37,878 | 15,302 | 692 |
| ui | 256,749 | 114,800 | 8,732 |
| components | 39,287 | 36,647 | 3,908 |
| kit | 60,644 | 20,724 | 544 |
| core | 87,120 | 75,331 | 30,205 |

Caveat: `_all_docs` may still list some names that were unpublished. Their share is UNVERIFIED, so read these as names ever registered, not names currently installable. The "substring" column for short words is inflated (`ui` matches `build` and `quick`; `kit` matches `toolkit`, which arguably fits). Use "whole segment" for comparisons.

### 2d. `headless`: what the top 50 search results are

Command: `curl -s "https://registry.npmjs.org/-/v1/search?text=headless&size=50"` (raw: `raw/h50.json`). Sorted into groups by hand from each package's name and description.

**Headless UI components or hooks (unstyled front-end widgets): 21 of 50.** `@full-ui/headless-calendar`, `@full-ui/headless-grid`, `@primereact/headless`, `bits-ui`, `headless-datetimepicker`, `@uppy/components`, `@tanstack/react-virtual`, `terracotta`, `@mui/x-chat-headless`, `@tanstack/react-table`, `react-headless-pagination`, `@tanstack/table-core`, `@daformat/react-headless-carousel`, `headless-tooltip`, `@openuidev/react-headless`, `@tanstack/virtual-core`, `@fusion.dev/helix-headless`, `@tanstack/vue-virtual`, `@reshaped/headless`, `@qwik-ui/headless`, `@wix/headless-forms`.

**Borderline, UI-adjacent: 3.** `@tiptap/core` ("headless rich text editor"), `@wix/headless-ecom` (commerce components tied to a Wix backend), `@opencx/widget-react-headless` (hooks for a chat widget).

**Headless browser or test display: 7.** `headless` (Xvfb wrapper), `puppeteer-core`, `puppeteer`, `mocha-headless-chrome`, `@line/headless-inspector`, `@wdio/xvfb`, `headless-detector`.

**Headless CMS, commerce or service SDK ("headless" meaning an API-only backend): 10.** `@coveo/headless`, `@coveo/headless-react`, `@wix/headless-site`, `@wix/headless-node`, `@unifold/headless-react`, `payload`, `@adobe/aem-headless-client-js`, `@yext/search-headless-react`, `@vendure/core`, `auth0-js`.

**Other (terminal, editor server side, CLI modes): 9.** `@xterm/headless`, `@lexical/headless`, `obsidian-headless`, `amplify-headless-interface`, `bpmn-js-headless`, `@headless-adminapp/fluent`, `@alpaca-headless/alpaca-headless`, `@haklex/rich-headless`, `@theia/plugin-ext-headless`.

So about 21 to 24 of the top 50 (42 to 48%) mean "unstyled UI". The rest use "headless" for browsers, backends or no-display modes. The #1 result, the bare `headless` package, is an Xvfb wrapper.

## 3. What scoped `@x/<suffix>` packages usually contain

How the samples were picked: `/tmp/pkgname/research/scripts/suffix.py <word>` pages `https://registry.npmjs.org/-/v1/search?text=<word>&size=250&from=0..5000`, keeps names matching `@*/<word>`, and sorts them by the `downloads.weekly` field in the search response (raw: `raw/suf_<word>.json`). Matches found: base 153, ui 537, primitives 168, components 361, core 1,739. The samples below are the top 20 by weekly downloads, with descriptions copied verbatim from the search response. A second "UI ecosystem" list uses `npm view <pkg> description` and `https://api.npmjs.org/downloads/point/last-week/<pkg>` (2026-11-10 to 2026-11-16). Bias: only the first 5,250 search results were seen, so these are popular examples, not a random sample.

### `@x/base` (top 20 by weekly downloads)

| Package | Weekly | Description (verbatim) |
|---|---:|---|
| @scure/base | 17,185,858 | Secure, audited & 0-dep implementation of base64, bech32, base58, base32 & base16 |
| @wallet-standard/base | 3,595,427 | This package defines the foundational TypeScript types of the Wallet Standard, and so provides a practical specification of the Wallet Standard until a formal specification may be completed. |
| @material/base | 931,053 | The set of base classes for Material Components for the web |
| @containerbase/base | 473,009 | Metadata about the tools supported by containerbase |
| @kubernetes-models/base | 271,812 | Base model for Kubernetes models. |
| @vibe/base | 153,641 | Vibe sub-package for base components |
| @spectrum-web-components/base | 113,002 | The `SpectrumElement` base class as created by mixing `SpectrumMixin` onto `LitElement` provides text direction support via the CSS `:dir()` pseudo-class, which automatically inherits directionality from the DOM hierarchy. In a TypeScript context, it also (truncated by the search API) |
| @rneui/base | 75,009 | Cross Platform React Native UI Toolkit |
| @sveltekit-i18n/base | 38,824 | Base functionality of sveltekit-i18n library with a support for external message parsers. |
| @pixi-spine/base | 36,330 | Base of pixi-spine integration, common files for spine runtimes of different versions |
| @rmwc/base | 30,606 | RMWC base module |
| @companion-module/base | 26,993 | This module provides the base class and framework needed to write a module for [Companion 3.0](https://github.com/bitfocus/companion) and later in NodeJS. |
| @neo4j-nvl/base | 22,128 | Base library for the Neo4j Visualization Library |
| @celo/base | 14,864 | Celo base common utils, no dependencies |
| @web3auth/base | 12,416 | (no description) |
| @eui/base | 12,148 | eUI base package - holding common for dependent subs |
| @rimbu/base | 10,687 | Utilities to implement Rimbu collections |
| @intentic/base | 10,191 | Runtime primitives every tier shares, when-expressions, disposal, and the async schedulers |
| @bitbybit-dev/base | 7,580 | Bit By Bit Developers Base CAD Library to Program Geometry |
| @salla.sa/base | 6,215 | Salla Base |

Also: `@mui/base`, 4,603,912/wk (separate download lookup), "MUI Base is a library of headless ('unstyled') React components and low-level hooks. You gain complete control over your app's CSS and accessibility features." Deprecated in favour of `@base-ui/react`.

Note: `@scure/base` uses "base" to mean a number base (base64, base58), a separate meaning that collides with the name.

### `@x/ui` (top 20 by weekly downloads)

| Package | Weekly | Description (verbatim) |
|---|---:|---|
| @vitest/ui | 27,502,526 | UI for Vitest |
| @expo/ui | 6,964,854 | A collection of UI components |
| @sanity/ui | 3,347,036 | The Sanity UI components. |
| @bull-board/ui | 2,788,662 | A Dashboard UI built on top of bull or bullmq. |
| @spectrum-icons/ui | 2,118,188 | Spectrum UI components in React |
| @restart/ui | 1,199,474 | Utilities for creating robust overlay components |
| @nuxt/ui | 1,051,987 | A UI Library for Modern Web Apps, powered by Vue & Tailwind CSS. |
| @nous-research/ui | 988,129 | the shared design system for react ui @ nous. components, hooks, utils, fonts, overlays, etc. |
| @univerjs/ui | 961,407 | Shared application UI framework, workbench services, menus, dialogs, and Facade UI APIs for Univer. |
| @storybook/ui | 739,240 | Core Storybook UI |
| @clerk/ui | 701,009 | Internal package that contains the UI components for the Clerk frontend SDKs |
| @inkjs/ui | 680,191 | Collection of customizable UI components for CLIs made with Ink |
| @aws-amplify/ui | 671,671 | `@aws-amplify/ui` contains low-level logic & styles for stand-alone usage or re-use in framework-specific implementations. |
| @lobehub/ui | 612,535 | Lobe UI is an open-source UI component library for building AIGC web apps |
| @wordpress/ui | 519,068 | Themeable React UI components for the WordPress Design System. |
| @c15t/ui | 344,614 | Framework-agnostic UI primitives, CSS and theme tokens behind the c15t React, Vue, Svelte and Astro components. |
| @pstdio/ui | 289,561 | Shared React UI package for Prompt Studio apps. This package owns: |
| @sats-connect/ui | 219,921 | A Bitcoin Web3 wallet provider selector. Built as a custom element, compatible with all major UI frameworks. |
| @rozenite/ui | 160,189 | Shared UI foundation and layout primitives for Rozenite DevTools plugin panels |
| @shadcn/ui | 157,046 | Add @shadcn/ui components to your app. |

### `@x/primitives` (top 20 by weekly downloads)

| Package | Weekly | Description (verbatim) |
|---|---:|---|
| @dotenvx/primitives | 17,045,503 | a secure dotenv–from the creator of `dotenv` |
| @react-pdf/primitives | 10,096,653 | Define uninitialized elements |
| @edge-runtime/primitives | 9,096,042 | A set of primitives to build Vercel Edge Runtime. |
| @wordpress/primitives | 591,919 | WordPress cross-platform primitives. |
| @atlaskit/primitives | 420,821 | Primitives are token-backed low-level building blocks. |
| @tldraw/primitives | 174,604 | A tiny little drawing app (primitives). |
| @dynamic-labs-wallet/primitives | 167,622 | (no description) |
| @primer/primitives | 133,771 | Typography, spacing, and color primitives for Primer design system |
| @shadcn-svelte/primitives | 19,672 | Unstyled components for Svelte. |
| @sheetxl/primitives | 11,227 | Primitives - Base types for SheetXL functions. |
| @texuli/primitives | 7,864 | Owned, headless Svelte 5 primitives built on the texels. |
| @publier/primitives | 7,745 | MDX-facing interactive primitives for Publier (Accordion, Tooltip, Tabs, CopyButton, ImageZoom, ColorSwatch, ViewAnimation). Zero-Qwik Astro components built on daisyUI + HTML natives + lazy-upgraded web components. |
| @amigo-ai/primitives | 7,051 | Concurrence Design System - Radix-wrapped UI primitives |
| @sema-agent/primitives | 4,681 | Shared low-level definitions of the sema engine, importable by any layer: (truncated here; full text in raw/suf_primitives.json) |
| @reatom/primitives | 3,972 | Reatom for primitives |
| @impulse-ui-native/primitives | 2,806 | Foundational UI primitives for building ImpulseUI Native components. |
| @tallyui/primitives | 2,237 | Headless, accessible React Native primitives for Tally UI |
| @radix-ng/primitives | 2,221 | Headless, signals-first UI primitives with first-class Angular Forms support. |
| @graview/primitives | 1,909 | The primitive set, the lenses, the workbench and the visual system. |
| @dogsbay/primitives | 1,907 | (no description) |

### `@x/components` (top 20 by weekly downloads)

| Package | Weekly | Description (verbatim) |
|---|---:|---|
| @storybook/components | 6,960,113 | Core Storybook Components |
| @figspec/components | 3,121,054 | Unofficial Figma spec viewer: Live Embed Kit - Live + Guidelines + Inspector |
| @scalar/components | 2,460,622 | Scalars component library |
| @ariakit/components | 1,306,702 | Ariakit components |
| @uppy/components | 986,726 | Headless Uppy components, made in Preact |
| @milkdown/components | 967,884 | The components module of [milkdown](https://milkdown.dev/). |
| @wordpress/components | 881,193 | UI components for WordPress. |
| @vueuse/components | 736,183 | Renderless components for VueUse |
| @cloudscape-design/components | 183,439 | This package contains the source code of the React components for the [Cloudscape Design System](https://cloudscape.design/). |
| @thatopen/components | 155,882 | Collection of core functionalities to author BIM apps. |
| @duffel/components | 103,117 | Component library to build your travel product with Duffel. |
| @serverless/components | 87,331 | The Serverless Framework's new infrastructure provisioning technology — Build, compose, & deploy serverless apps in seconds... |
| @theme-ui/components | 68,393 | Primitive layout, typographic, and other components for use with Theme UI. |
| @vue-email/components | 44,718 | A collection of all components Vue Email. |
| @tarojs/components | 42,091 | Taro 组件库 |
| @stacksjs/components | 42,078 | A modern component library built with STX, featuring headwind utility classes and TypeScript syntax highlighting. |
| @civitai/components | 39,991 | Attribute-driven, framework-agnostic component CSS for civitai App Blocks. Plain HTML or any framework, themed by @civitai/theme. |
| @perses-dev/components | 35,576 | Common UI components used across Perses features |
| @joyfill/components | 29,709 | Joyfill UI Components |
| @layerfi/components | 28,258 | Layer React Components |

### `@x/core` (top 20 by weekly downloads, then UI-ecosystem examples)

| Package | Weekly | Description (verbatim) |
|---|---:|---|
| @babel/core | 260,479,613 | Babel compiler core. |
| @opentelemetry/core | 216,471,352 | OpenTelemetry Core provides constants and utilities shared by all OpenTelemetry SDK packages. |
| @eslint/core | 172,711,455 | Runtime-agnostic core of ESLint |
| @humanfs/core | 154,292,865 | The core of the humanfs library. |
| @aws-sdk/core | 153,929,130 | Core functions & classes shared by multiple AWS SDK clients. |
| @smithy/core | 147,820,409 | (README badges only, no prose description) |
| @floating-ui/core | 141,656,236 | Positioning library for floating elements: tooltips, popovers, dropdowns, and more |
| @sentry/core | 103,774,215 | Base implementation for all Sentry JavaScript SDKs |
| @inquirer/core | 95,889,129 | Core Inquirer prompt API |
| @emnapi/core | 92,447,662 | emnapi core |
| @jest/core | 59,132,891 | Delightful JavaScript Testing. |
| @swc/core | 58,061,828 | Super-fast alternative for babel |
| @pkgr/core | 56,491,383 | Shared core module for `@pkgr` packages or any package else |
| @octokit/core | 47,967,872 | Extendable client for GitHub's REST & GraphQL APIs |
| @clack/core | 44,780,947 | Clack contains low-level primitives for implementing your own command-line applications. |
| @dnd-kit/core | 43,201,878 | dnd kit – a lightweight React library for building performant and accessible drag and drop experiences |
| @shikijs/core | 39,980,735 | Core of Shiki |
| @modelcontextprotocol/core | 39,540,380 | Model Context Protocol for TypeScript — public Zod schemas (spec + OAuth/OpenID) |
| @speed-highlight/core | 38,877,269 | A tiny, fast, simple syntax highlighter for the web and the terminal in JavaScript |
| @angular-devkit/core | 37,352,133 | Angular DevKit - Core Utility Library |

UI-ecosystem `core` packages (`npm view <pkg> description` plus the downloads API):

| Package | Weekly | Description (verbatim) |
|---|---:|---|
| @tiptap/core | 37,884,611 | headless rich text editor |
| @kobalte/core | 6,054,988 | Unstyled components and primitives for building accessible web apps and design systems with SolidJS. |
| @mantine/core | 3,681,216 | React components library focused on usability, accessibility and developer experience |
| @zag-js/core | 2,342,855 | A minimal implementation of xstate fsm for UI machines |
| @blueprintjs/core | 370,664 | Core styles & components |

### Other UI-ecosystem reference points (`npm view` plus the downloads API, 2026-11-10 to 2026-11-16)

| Package | Weekly | Description (verbatim) |
|---|---:|---|
| @mui/material | 14,132,565 | Material UI is an open-source React component library that implements Google's Material Design. It's comprehensive and can be used in production out of the box. |
| @chakra-ui/react | 2,222,662 | Responsive and accessible React UI components built with React and Emotion |
| @nuxt/ui | 1,077,760 | A UI Library for Modern Web Apps, powered by Vue & Tailwind CSS. |
| @fluentui/react-components | 620,021 | Suite package for converged React components |
| @atlaskit/primitives | 434,243 | Primitives are token-backed low-level building blocks. |
| @primer/primitives | 133,073 | Typography, spacing, and color primitives for Primer design system |
| @radix-ng/primitives | 3,004 | Headless, signals-first UI primitives with first-class Angular Forms support. |

(The search-response weekly figures and the downloads API figures differ slightly for the same package, for example `@nuxt/ui` 1,051,987 vs 1,077,760, because the search index's weekly number covers a slightly different window.)

### Summary: what each suffix usually holds

**`@x/ui`**: almost always a ready-to-use, styled component library or design system (Expo, Sanity, Nuxt, WordPress, Lobe, shadcn), or the app's own screen ("UI for Vitest", Storybook, bull-board). Only a few are unstyled logic (`@restart/ui`, `@aws-amplify/ui`, `@c15t/ui`). A reader will expect styled components.

**`@x/components`**: a styled component library for one product or design system (Storybook, Scalar, WordPress, Cloudscape, Duffel). Exceptions use a qualifier in the description: `@uppy/components` ("Headless"), `@vueuse/components` ("Renderless"). Outside UI it also means "modules" (`@serverless/components`, `@thatopen/components`).

**`@x/primitives`**: split. In design systems (Atlassian, Primer) it means design tokens or low-level layout building blocks such as Box and Stack. For smaller UI kits it means headless or unstyled widgets (`@shadcn-svelte/primitives`, `@radix-ng/primitives`, `@tallyui/primitives`, `@texuli/primitives`). Outside UI, the most downloaded ones are runtime building blocks (`@edge-runtime/primitives`, `@react-pdf/primitives`, `@dotenvx/primitives`). In UI it carries the Radix meaning (unstyled building blocks); in general it means "low-level pieces".

**`@x/base`**: base classes, shared types or common utilities that other packages in the family build on (`@material/base`, `@spectrum-web-components/base`, `@wallet-standard/base`, `@celo/base`, `@eui/base`). Rarely a component set (`@rneui/base` is a styled toolkit; `@vibe/base` is "base components"). The headless meaning came from MUI Base, `@mui/base`, which is now deprecated and renamed to Base UI (`@base-ui/react`). It also collides with the number-base meaning (`@scure/base`).

**`@x/core`**: the engine or shared runtime of a multi-package family, usually without UI (Babel, OpenTelemetry, ESLint, AWS SDK, Sentry, Jest). In UI families it varies: the headless engine (`@zag-js/core`, `@floating-ui/core`, `@tiptap/core`, `@dnd-kit/core`), unstyled components (`@kobalte/core`), or the main styled library (`@mantine/core`, `@blueprintjs/core`). So "core" says "main package of the family" and says nothing about styled vs headless.

## UNVERIFIED / not measured

- Whether registry search `total` also matches README text. The npm docs and API responses do not state the indexed fields, so "name + description + keywords (and possibly README)" is UNVERIFIED.
- The exact grouping in 2d is a judgment call from names and descriptions, without opening each package.
- Section 3 samples come from the first 5,250 search results per word, ranked by search relevance and then sorted by downloads. Popular packages beyond that window may be missing. They are examples, not a census.
