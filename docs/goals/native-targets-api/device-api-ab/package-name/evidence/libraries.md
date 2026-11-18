# How headless / unstyled UI libraries name and describe themselves

Fetched 2026-11-17 with `curl` (static HTML; title tag, meta description and the first paragraphs after the first `<h1>` were extracted mechanically) plus the npm registry (`registry.npmjs.org/<pkg>/latest`, field `description`) and GitHub READMEs (`raw.githubusercontent.com`). Quotes are copied as fetched. "npm description" means the `description` field of the latest published version. Raw fetches are kept in `/tmp/pkgname/research/raw/`.

Lead word = the first self-describing word from the list (headless, unstyled, primitives, base, accessible, behaviours/behaviors, kit, components, ui, other) that appears in the main hero/tagline. "Words present" covers the tagline plus first paragraph.

---

## Radix Primitives (React)

- npm: `radix-ui` (umbrella package, 1.8.1) and per-component `@radix-ui/react-*` (for example `@radix-ui/react-tabs` 1.2.1, `@radix-ui/react-dialog` 1.3.1). Neither has an npm `description` field.
- Title tag (https://www.radix-ui.com/primitives): "Radix Primitives"
- Meta description, same URL: "Unstyled, accessible, open source React primitives for high-quality web apps and design systems."
- Hero h1, same URL: "Core building blocks for your design system"
- Intro page (https://www.radix-ui.com/primitives/docs/overview/introduction), subtitle: "An open-source UI component library for building high-quality, accessible design systems and web apps."
- First paragraph, same URL: "Radix Primitives is a low-level UI component library with a focus on accessibility, customization and developer experience. You can use these components either as the base layer of your design system, or adopt them incrementally."
- GitHub README (radix-ui/primitives) repeats the subtitle and that paragraph word for word.
- Lead word: **unstyled** (meta), product noun **primitives**. Hero says "building blocks". Words present: unstyled, accessible, primitives, UI, component(s), base ("base layer"), "low-level".

## Radix Themes (styled, for contrast)

- npm: `@radix-ui/themes` (3.3.0; the npm description is just a logo image link).
- Title tag (https://www.radix-ui.com/themes): "Radix UI"
- Meta description: "Components, icons, and colors for building high‑quality, accessible UI. Free and open-source."
- Hero p: "An open source component library optimized for fast development, easy maintenance, and accessibility. Just import and go—no configuration required."
- Getting started (https://www.radix-ui.com/themes/docs/overview/getting-started): "Radix Themes is a pre-styled component library that is designed to work out of the box with minimal configuration. If you are looking for the unstyled components, go to Radix Primitives."
- Lead word: **components** / "pre-styled". The unstyled layer underneath is called **"Radix Primitives"** ("the unstyled components").

## Base UI (MUI team, base-ui.com)

- npm: `@base-ui/react` (1.9.0). The earlier name `@base-ui-components/react` (1.0.0-rc.0) is deprecated: "Package was renamed to @base-ui/react".
- npm description: "Base UI is a library of headless ('unstyled') React components and low-level hooks. You gain complete control over your app's CSS and accessibility features."
- Title tag (https://base-ui.com): "Unstyled UI components for accessible design systems · Base UI"
- Hero h1: "Unstyled UI components for building accessible user interfaces"
- Hero p: "From the creators of Radix, Floating UI, and Material UI, Base UI is a comprehensive UI component library for building accessible user interfaces with React."
- About page (https://base-ui.com/react/overview/about.md), subtitle: "An open-source React component library for building accessible user interfaces." First paragraph: "From the creators of Radix, Material UI, and Floating UI, Base UI is an unstyled React component library for building accessible user interfaces." The first feature heading is "Headless": "Base UI components are unstyled, don't bundle CSS, and don't prescribe a styling solution."
- GitHub README (mui/base-ui): "From the creators of Radix, Floating UI, and Material UI, Base UI is an unstyled UI component library for building accessible user interfaces."
- https://mui.com/base-ui/ now serves the same page as base-ui.com (same title and hero).
- Lead word: **unstyled**. Words present: unstyled, UI, components, accessible, headless (npm description and features), "low-level hooks".

## MUI Base (older `@mui/base`)

- npm: `@mui/base` (5.0.0-beta.70), deprecated: "This package has been replaced by @base-ui/react".
- npm description: "MUI Base is a library of headless ('unstyled') React components and low-level hooks. You gain complete control over your app's CSS and accessibility features."
- Lead word: **headless** (glossed as "unstyled"). The product name used **Base**. I did not fetch the old docs page; it now redirects to base-ui.com.

## Headless UI (Tailwind Labs)

- npm: `@headlessui/react` (2.2.10), `@headlessui/vue` (1.7.23).
- npm descriptions: "A set of completely unstyled, fully accessible UI components for React, designed to integrate beautifully with Tailwind CSS." (The Vue one says "for Vue 3".)
- Title tag (https://headlessui.com): "Headless UI - Unstyled, fully accessible UI components"
- Hero h1 / og:description: "Completely unstyled, fully accessible UI components, designed to integrate beautifully with Tailwind CSS."
- The homepage has no intro paragraph beyond the hero; the README says the same as npm.
- Lead word: **unstyled**. The brand name is "Headless", but the tagline never uses "headless" as a descriptor. Words present: unstyled, accessible, UI, components.

## React Aria / React Aria Components (Adobe)

- npm: `react-aria` (3.53.1; description "Spectrum UI components in React"), `react-aria-components` (1.22.1; description "A library of styleable components built using React Aria"), plus per-hook packages like `@react-aria/button` (same description, "Spectrum UI components in React").
- Title tag (https://react-spectrum.adobe.com/react-aria/): "React Aria"
- Hero h1: "Craft world-class accessible components with custom styles."
- Hero p: "Over 50 components with built-in behavior, adaptive interactions, top-tier accessibility, and internationalization out of the box, ready for your styles."
- Further down the same page: "Get complete control with hooks. Drop down to the low-level Hook-based API to intercept events, override behavior, customize DOM elements, and much more."
- Getting started (https://react-spectrum.adobe.com/react-aria/getting-started.html): "How to install React Aria and build your first component." The install command shown is `npm install react-aria-components`.
- adobe/react-spectrum README: "A library of unstyled React components and hooks that helps you build accessible, high quality UI components for your application or design system."
- Lead word: **accessible** (hero). Words present: accessible, components, behavior, "custom styles" / "styleable"; README adds unstyled and hooks. The site avoids the words "headless" and "unstyled". It says "ready for your styles" instead.

## Ark UI (Chakra team)

- npm: `@ark-ui/react`, `@ark-ui/solid`, `@ark-ui/vue` (5.40.0), `@ark-ui/svelte` (5.25.1).
- npm description: "A collection of unstyled, accessible UI components for React, utilizing state machines for seamless interaction." (The Solid, Vue and Svelte packages use the same wording.)
- Title tag (https://ark-ui.com): "Ark UI". Meta description: "A headless UI library with over 45+ components designed to build reusable, scalable Design Systems that works for a wide range of JS frameworks."
- Hero h1: "Unstyled UI components for your Design System"
- Hero p: "A headless library with 45+ accessible components. Bring your own styles and build a design system that works across React, Solid, Vue, and Svelte." The first feature card is "Truly Headless".
- llms.txt (https://ark-ui.com/llms.txt): "Ark UI is a headless component library for building design systems. It ships the same accessible, unstyled components for React, Solid, Svelte, and Vue, built on Zag.js state machines."
- GitHub README (chakra-ui/ark): "Build scalable design systems with unstyled, accessible UI components" / "Ark UI is a headless component library that provides the foundation for building high-quality, accessible design systems and web applications."
- The docs intro page (https://ark-ui.com/docs/overview/introduction) is client-rendered; static HTML had no body text. **UNVERIFIED** for the intro paragraph. The getting-started page (llms.txt/overview/getting-started) only says "A Step-by-step Guide to Using Ark UI".
- Lead word: **unstyled** (h1) and **headless** (meta, hero p). Words present: headless, unstyled, accessible, UI, components.

## Zag.js (Chakra team)

- npm: `@zag-js/core` (1.48.0; description "A minimal implementation of xstate fsm for UI machines") and per-widget packages, for example `@zag-js/dialog` ("Core logic for the dialog widget implemented as a state machine").
- Title tag (https://zagjs.com): "Zag - Rapidly build UI components without sweating over the logic."
- Meta description: "State machines for accessible, interactive and performant UI components"
- Hero h1: "UI components powered by Finite State Machines". Hero p: "A collection of framework-agnostic UI component patterns like accordion, menu, and dialog that can be used to build design systems for React, Vue, Solid.js and Svelte"
- Intro (https://zagjs.com/overview/introduction): "Zag is a framework agnostic toolkit for implementing complex, interactive, and accessible UI components in your design system and web applications. Works for React, Solid and Vue."
- GitHub README: "Accessible component logic for React, Vue, Solid, and Svelte." / "... You control the markup and styling; Zag handles the behavior."
- Lead word: **other**, namely "state machines" / "component logic" / "toolkit". Words present: UI, components, accessible, behavior (README), "logic", "toolkit". It never uses headless, unstyled or primitives.

## Ariakit

- npm: `@ariakit/react` (0.4.43; description "Toolkit for building accessible web apps with React"). The older `ariakit` is deprecated ("renamed to @ariakit/react").
- Title tag (https://ariakit.org): "Ariakit - Toolkit for building accessible UIs"
- Meta description: "Lower-level component library for building accessible higher-level UI libraries, design systems and web applications with React."
- Hero h1: "Build accessible web apps with React". Hero p: "Open-source library with unstyled, primitive components, with a collection of styled examples that you can copy and paste into your apps."
- Getting started (https://ariakit.org/guide/getting-started): "Ariakit is an open source library that provides lower-level React components and hooks for building accessible web apps, design systems, and component libraries."
- I tried the README at github ariakit/ariakit main/README.md and got a 404, so it is **UNVERIFIED**.
- Lead word: **other**, namely "toolkit" (title, npm) / **accessible**. Words present: kit ("toolkit"), accessible, unstyled, primitive, components, UI, "lower-level".

## Kobalte (SolidJS)

- npm: `@kobalte/core` (0.13.14; description "Unstyled components and primitives for building accessible web apps and design systems with SolidJS.").
- Title tag (https://kobalte.dev): "Kobalte". The meta description is the same as the npm description.
- Intro (https://kobalte.dev/docs/core/overview/introduction): "Kobalte is a UI toolkit for building accessible web apps and design systems with SolidJS. It provides a set of low-level UI components and primitives which can be the foundation for your design system implementation."
- GitHub README: "A UI toolkit for building accessible web apps and design systems with SolidJS"
- Lead word: **unstyled** (npm/meta); intro leads with **"UI toolkit"**. Words present: unstyled, components, primitives, accessible, UI, kit ("toolkit"), "low-level".

## Melt UI (Svelte)

- npm: `@melt-ui/svelte` (0.86.6; the description is only a banner image) and `melt` (0.44.0; description "The next generation of Melt UI. Built for Svelte 5.").
- Title tag (https://melt-ui.com): "Melt UI". Meta: "An open-source Svelte component library for building high-quality, accessible design systems and web apps."
- Homepage: "melt away complexity" / "What is it? A collection of accessible & unstyled component builders for Svelte applications."
- Intro (https://www.melt-ui.com/docs/introduction): "An open-source collection of accessible and customizable component builders for creating user interfaces with Svelte." / "Melt UI empowers developers to create accessible UIs that embody their unique style. With a strong focus on accessibility, limitless customization options, and an overall delightful developer experience, Melt UI strives to be the de-facto headless UI library for Svelte."
- GitHub README: "Melt UI is a set of headless, accessible component builders for Svelte." / "Melt UI is meant to be used as a base for your own styles and components."
- Lead word: **accessible** (meta and intro); product noun **"builders"** (other). Words present: accessible, unstyled, headless, component(s), UI, base (README).

## Bits UI (Svelte)

- npm: `bits-ui` (2.21.0; description "The headless components for Svelte.").
- Title tag (https://bits-ui.com): "Bits UI – Headless components for Svelte". Hero h1: "The headless components for Svelte"
- Hero p: "Flexible, unstyled, and accessible primitives that provide the foundation for building your own high-quality component library."
- Intro (https://bits-ui.com/docs/introduction): "Bits UI is a headless component library for Svelte focused on developer experience, accessibility, and full creative control. Use it to build high-quality, accessible UIs without giving up styling freedom or performance."
- Lead word: **headless**. Words present: headless, components, unstyled, accessible, primitives, UI.

## Reka UI (formerly Radix Vue)

- npm: `reka-ui` (2.11.0) and `radix-vue` (1.9.17). Both have the npm description "Vue port for Radix UI Primitives."
- Title tag (https://reka-ui.com): "Reka UI - Unstyled, fully accessible UI library | Reka UI"
- Meta: "An open-source library with unstyled, primitive components, accompanied by a variety of examples & use cases ready to be integrated into your projects."
- Hero h1: "Craft accessible web apps with Vue" (the README says the same).
- Intro (https://reka-ui.com/docs/overview/introduction): "An open-source UI component library for building high-quality, accessible design systems and web apps using Vue.js." / "Presenting Reka UI, the new identity of Radix Vue in its v2 evolution." / "Reka (pronounced /ree·kuh/) means "design" in Malay, and also evokes "Eureka.""
- Lead word: **unstyled** (title). Words present: unstyled, accessible, UI, primitive(s), components.

## Qwik UI (headless kit and styled kit)

- npm: `@qwik-ui/headless` (0.7.8; description "Qwik UI headless components library"), `@qwik-ui/styled` (0.4.1; description "Qwik UI components library with styles"), `qwik-ui` (0.4.4; description "Qwik UI Command line interface").
- Title tag (https://qwikui.com): "Qwik UI - The world's fastest loading UI components library". Meta: "A collection of ready-to-use components and primitives for building high-quality, accessible web applications with Qwik."
- Homepage kit cards: headless, "A headless component library of completely unstyled, accessible, and resumable components for the most creative minds."; styled, "A design system of copy-paste, reusable, styled components built on top of headless. Easy to use, easy to customize."
- Headless intro (https://qwikui.com/docs/headless/introduction), h1 "Headless kit": "Qwik UI is a tool to help you build better design systems. It includes components with no default styles and a styled kit with configurable presets. Both are fully customizable and accessible." / "You are currently exploring the headless kit, which manages the essential structure, behavior, and state of advanced UI components."
- Styled intro (https://qwikui.com/docs/styled/introduction), h1 "Styled Kit": "Inspired by Shadcn UI, the styled kit is an innovative collection of pre-designed, fully customizable, and easy-to-reuse copy-paste components built with Tailwind, cva and css variables on top of the Qwik UI headless components."
- GitHub README: "The components library for Qwik"
- Lead word: **headless** (package and kit name); the umbrella term is **kit**. Words present: headless, unstyled, accessible, components, primitives, kit, UI, behavior. The styled kit calls the layer underneath "the Qwik UI headless components" / "headless".

## Angular CDK

- npm: `@angular/cdk` (22.2.7; description "Angular Material Component Development Kit").
- Site https://material.angular.dev/cdk: title tag "Angular Material UI Component Library"; meta description "UI component infrastructure and Material Design components for mobile and desktop Angular web applications." The page is client-rendered and the static HTML has no CDK body text, so the CDK intro paragraph is **UNVERIFIED**.
- angular/components README package table: "`@angular/cdk` | Library that helps you author custom UI components with common interaction patterns"
- Lead word: **kit** ("Component Development Kit"). Words present: component(s), kit, UI, "interaction patterns", "infrastructure".

## Angular Aria (exists: `@angular/aria`)

- npm: `@angular/aria` (22.2.7; description "Angular Aria").
- Page https://angular.dev/guide/aria/overview: title "Angular Aria • Overview • Angular"; h1 "Angular Aria".
- First paragraphs: "Building accessible components seems straightforward, but implementing them according to the W3C Accessibility Guidelines requires significant effort and accessibility expertise." / "Angular Aria is a collection of headless, accessible directives that implement common WAI-ARIA patterns. The directives handle keyboard interactions, ARIA attributes, focus management, and screen reader support. All you have to do is provide the HTML structure, CSS styling, and business logic!"
- angular/components README: "`@angular/aria` | Collection of headless, accessible directives that implement common WAI-ARIA patterns"
- Lead word: **headless**. Product noun: "directives" (other). Words present: headless, accessible, components.

## Angular Primitives (`ng-primitives`)

- npm: `ng-primitives` (0.131.4; description "Angular Primitives is a low-level headless UI component library with a focus on accessibility, customization, and developer experience.").
- Title tag (https://angularprimitives.com): "Angular Primitives". The meta description is the same as the npm description.
- Hero h1: "Headless UI  Perfected for Angular". Hero p: "A comprehensive suite of unstyled, accessible primitives expertly crafted for Angular, enabling you to build design systems faster than ever before."
- Homepage: "Angular Primitives helps you move faster by replacing traditional component libraries with a collection of low-level, accessible building blocks." / "Headless by Design Build exactly what you need with completely unstyled components."
- Intro (https://angularprimitives.com/getting-started/introduction): "Angular Primitives is a low-level headless UI component library with a focus on accessibility, customization, and developer experience. Whether you're building a robust design system from scratch or looking to enhance your existing one, our primitives are here to support you every step of the way."
- Lead word: **headless** (h1, npm); product noun **primitives**. Words present: headless, UI, component, primitives, unstyled, accessible, "low-level", "building blocks".

## shadcn/ui

- npm: `shadcn` (4.23.0; the CLI; description "Add components to your apps."). The old `shadcn-ui` is no longer supported.
- Title tag (https://ui.shadcn.com): "shadcn/ui - The Foundation for your Design System". Meta: "Composable, accessible components with thoughtful defaults. Build your own component library with code you can customize, extend, and make your own."
- Intro (https://ui.shadcn.com/docs): "shadcn/ui is a set of beautifully-designed, accessible components and a code distribution platform. Works with your favorite frameworks and AI models. Open Source. Open Code." / "This is not a component library. It is how you build your component library."
- Unstyled layer: https://ui.shadcn.com/llms.txt says "It is built with TypeScript, Tailwind CSS, and Radix UI primitives." Component docs exist under two paths, `/docs/components/radix/…` and `/docs/components/base/…` (both returned 200), so it ships variants built on Radix and on Base UI. The layer underneath is called **"Radix UI primitives"**.
- Lead word: **components** / "Foundation". Words present: accessible, components.

## Tamagui

- npm: `tamagui` (3.3.3; description "Style and UI for React (web and native) meet an optimizing compiler"), `@tamagui/core`, `@tamagui/web`, and `@tamagui/ui` (3.3.3; description "Unstyled, behavior-first UI primitives for Tamagui (web and native)").
- Title tag (https://tamagui.dev): "Tamagui". Meta: "Type-safe styles for React and React Native, with an optimizing compiler and Tailwind compatibility." Hero h1: "Fast on web. Fast on native.Now with style props or Tailwind."
- Intro (https://tamagui.dev/docs/intro/introduction): "Tamagui provides universal styling and UI components for React. All features work consistently across React Native and web."
- GitHub README: "Style library, design system, composable components, and more." / "`tamagui` - UI kit that adapts to every platform."
- Unstyled layer (https://tamagui.dev/llms.txt): "Use `tamagui/unstyled` or `@tamagui/ui` for behavior primitives without the default skin" and "Every one of them accepts `unstyled` to drop its default styles and keep only its behavior." The layer underneath is called **"behavior primitives"** / "unstyled primitives" (`@tamagui/ui`).
- Lead word: **other** ("styles"/"styling"); the styled package calls itself a **kit** ("UI kit").

## Chakra UI

- npm: `@chakra-ui/react` (3.38.0; description "Responsive and accessible React UI components built with React and Emotion").
- Title tag (https://chakra-ui.com): "Chakra UI". Meta: "Simple, Modular & Accessible UI Components for your React Applications". Hero h1: "Chakra UI is a component system for building products …" (the rest of the h1 is an animated span). Hero p: "Accessible React components for building high-quality web apps and design systems. Works with Next.js RSC"
- Unstyled layer: the homepage shows three tabs, "Chakra UI is a component library for building web applications.", "Ark UI is a headless library for building reusable, scalable design systems" and "Zag.js provides a set of UI components powered by Finite State Machines". The layer underneath is **Ark UI** ("headless library"), which sits on **Zag.js** (state machines).
- Lead word: **accessible** / "component system". Words present: accessible, UI, components.

## Mantine

- npm: `@mantine/core` (9.8.1; description "React components library focused on usability, accessibility and developer experience").
- Title tag (https://mantine.dev): "Mantine". Meta: "A fully featured React components library with 120+ customizable components, hooks, and utilities. Build accessible web applications faster." Hero h1: "A fully featured React components library". Hero p: "Build fully functional accessible web applications faster than ever – Mantine includes more than 120 customizable components and 70 hooks to cover you in any situation"
- Unstyled layer (https://mantine.dev/llms/styles-unstyled.md): headings "Unstyled / headless", "Unstyled components", "Using Mantine as a headless UI library"; text: "You can use Mantine as a headless UI library. To do that, simply do not import `@mantine/*/styles.css` in your application." It also provides `HeadlessMantineProvider`. There is no separate package; this is a **"headless" mode** of the same components.
- Lead word: **components**. Words present: components, accessible, hooks.

## daisyUI

- npm: `daisyui` (5.8.1; description "daisyUI 5 - The Tailwind CSS Component Library").
- Title tag (https://daisyui.com): "daisyUI - Tailwind CSS Component Library". Hero h1: "Faster, cleaner, easier Tailwind CSS development". Hero p: "daisyUI is the Tailwind CSS plugin you will love! It provides pure-CSS components to help your agent write less code and build faster."
- Intro (https://daisyui.com/docs/intro/): "daisyUI is a collection of CSS class names.These class names are a high-level abstraction of Tailwind CSS utility classes.Imagine you use Tailwind CSS with superpowers!"
- Unstyled layer: **none**. It is pure CSS with no behavior layer.
- Lead word: **components** / "CSS class names" (other).

## Others (quick)

### corvu (SolidJS)
- npm: `corvu` (0.7.2) and per-primitive packages like `@corvu/dialog`; description "Unstyled, accessible and customizable UI primitives for SolidJS".
- Title tag (https://corvu.dev): "Unstyled UI primitives for SolidJS". h1: "corvu - powerful UI primitives for SolidJS". Hero p: "A collection of open source UI primitives that are unstyled, accessible and aim to be highly customizable while providing a delightful developer experience".
- Lead word: **unstyled**; noun **primitives**.

### rn-primitives (React Native)
- npm: per-primitive packages like `@rn-primitives/dialog` (1.5.2; description "Primitive dialog").
- Title tag (https://rnprimitives.com): "React Native Primitives | rn-primitives". Meta: "Unstyled, accessible React Native components with a unified API for iOS, Android, and Web." h1: "Style-free building blocks for React Native". Feature card: "Unstyled on purposeNo design system to fight. Every primitive ships zero styles, so your components look like your app." (The card title and its text run together in the HTML.)
- GitHub README (roninoss/rn-primitives): "Universal Style agnostic and accessible react-native components"
- Lead word: **unstyled**; nouns "primitives", "building blocks".

### React Native Reusables (styled layer on rn-primitives)
- GitHub README: "Bringing [shadcn/ui](https://ui.shadcn.com) to React Native. Beautifully crafted components with [Nativewind]…". No unstyled descriptor. (The rn-primitives README is what ties the two projects together; I did not check that link separately.)

### gluestack-ui (React Native)
- npm: `@gluestack-ui/core` (5.0.15; description "Universal UI components for React Native, Expo, and Next.js"), `@gluestack-ui/themed` (1.1.73).
- Title tag (https://gluestack.io): "gluestack: React & React Native UI components library for Web & Mobile App". README: "gluestack-ui is a library of copy-pasteable components & patterns crafted with Tailwind CSS (NativeWind)."
- I could not quickly find a named unstyled layer in current wording (**UNVERIFIED**).
- Lead word: **components**.

---

## Observations (from the quotes above only)

- "Unstyled" is the most common lead adjective in hero lines and title tags: Radix, Base UI, Headless UI, Ark h1, Kobalte, Reka, corvu, rn-primitives.
- "Headless" leads where a library brands itself as a headless kit: Bits UI, Angular Aria, Angular Primitives h1, Qwik UI's kit, and the MUI Base and Base UI npm descriptions. It is often glossed: Base UI's npm says "headless ('unstyled')".
- "Primitives" is the most common product noun: Radix Primitives, Angular Primitives, corvu, rn-primitives, Bits UI, Kobalte, Tamagui's `@tamagui/ui`. Styled libraries use it for the layer underneath (Radix Themes points to "Radix Primitives"; shadcn says "Radix UI primitives"; Tamagui says "behavior primitives").
- "Accessible" appears in almost every tagline but usually second. It leads only for React Aria, Melt UI and Chakra.
- "Kit" appears as "toolkit" (Ariakit, Kobalte, Zag), "Component Development Kit" (Angular CDK), "headless kit" / "styled kit" (Qwik UI) and "UI kit" (Tamagui).
- "Behavior" is used as a descriptor only by Tamagui ("behavior-first UI primitives") and in supporting text (React Aria "built-in behavior", Zag "Zag handles the behavior", Qwik "structure, behavior, and state"). No library leads with it.
- "Base" as a self-descriptor is used only in names (Base UI, MUI Base) and in phrases like "the base layer of your design system" (Radix) and "used as a base for your own styles" (Melt).

## Summary table

| Library | Package name(s) | Lead word | Other words present (tagline + first paragraph) |
|---|---|---|---|
| Radix Primitives | `radix-ui`, `@radix-ui/react-*` | unstyled (noun: primitives) | accessible, primitives, UI, components, base ("base layer"), building blocks, low-level |
| Radix Themes | `@radix-ui/themes` | components ("pre-styled") | accessible, UI; calls underlying layer "Radix Primitives" / "unstyled components" |
| Base UI | `@base-ui/react` (was `@base-ui-components/react`) | unstyled | UI, components, accessible, headless (npm + features), low-level hooks |
| MUI Base (old) | `@mui/base` (deprecated) | headless ("headless ('unstyled')") | unstyled, components, low-level hooks |
| Headless UI | `@headlessui/react`, `@headlessui/vue` | unstyled | accessible, UI, components (headless only in brand name) |
| React Aria / RAC | `react-aria`, `react-aria-components`, `@react-aria/*` | accessible | components, behavior, custom styles/styleable, hooks; README adds unstyled |
| Ark UI | `@ark-ui/react`, `/solid`, `/vue`, `/svelte` | unstyled (h1) / headless (meta) | headless, unstyled, accessible, UI, components |
| Zag.js | `@zag-js/core`, `@zag-js/*` | other (state machines / component logic / toolkit) | UI, components, accessible, behavior (README), kit ("toolkit") |
| Ariakit | `@ariakit/react` | other ("toolkit") / accessible | kit, accessible, unstyled, primitive, components, UI, lower-level |
| Kobalte | `@kobalte/core` | unstyled | components, primitives, accessible, UI, kit ("UI toolkit"), low-level |
| Melt UI | `@melt-ui/svelte`, `melt` | accessible (noun: builders) | unstyled, headless, components, UI, base (README) |
| Bits UI | `bits-ui` | headless | components, unstyled, accessible, primitives, UI |
| Reka UI (ex Radix Vue) | `reka-ui` (was `radix-vue`) | unstyled | accessible, UI, primitive(s), components |
| Qwik UI headless kit | `@qwik-ui/headless` | headless | kit, unstyled, accessible, components, primitives, behavior, UI |
| Qwik UI styled kit | `@qwik-ui/styled` | other ("styled kit") / components | kit, components; calls underlying layer "headless components" |
| Angular CDK | `@angular/cdk` | kit ("Component Development Kit") | components, UI, interaction patterns, infrastructure (intro UNVERIFIED) |
| Angular Aria | `@angular/aria` | headless (noun: directives) | accessible, components |
| Angular Primitives | `ng-primitives` | headless (noun: primitives) | UI, component, primitives, unstyled, accessible, low-level, building blocks |
| shadcn/ui | `shadcn` (CLI) | components ("Foundation") | accessible; underlying layer "Radix UI primitives" (also Base UI variants) |
| Tamagui | `tamagui`, `@tamagui/core`, `@tamagui/ui` | other ("styles"/"styling") | UI, components, kit ("UI kit"); underlying layer "behavior primitives" / `unstyled` (`@tamagui/ui`) |
| Chakra UI | `@chakra-ui/react` | accessible / "component system" | UI, components; underlying layer Ark UI ("headless library") on Zag.js |
| Mantine | `@mantine/core` | components | accessible, hooks; unstyled layer is a "headless" mode (`HeadlessMantineProvider`) |
| daisyUI | `daisyui` | components / "CSS class names" | none of the headless terms; no unstyled layer |
| corvu | `corvu`, `@corvu/*` | unstyled (noun: primitives) | accessible, UI, primitives |
| rn-primitives | `@rn-primitives/*` | unstyled (noun: primitives) | accessible, components, building blocks, "style-free" |
| gluestack-ui | `@gluestack-ui/core`, `@gluestack-ui/themed` | components | UI; unstyled layer UNVERIFIED |
