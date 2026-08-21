---
name: markless-component-research
description: Research component accessibility patterns and API design for a @markless/ui family by analyzing headless UI libraries, the QDS reference, and accessibility specifications. Use before designing or migrating any component family — when asked to research a UI component, create its research.md, analyze accessibility patterns across component libraries, or document keyboard interactions and ARIA attributes.
---

# Component Research (Markless)

Research a UI component family before designing or migrating it. Adapted from the QDS component-research workflow; the QDS repo at `~/dev/open-source/qwik-design-system` is a READ-ONLY reference and its design decisions carry two years of work — never invent part names or APIs it already answers.

**Default output:** `packages/headless/components/src/{family}/research.md` (`research.mdx` if JSX examples are needed).

## Workflow

### 1. Component name and alternates

Use the name from the request. Brainstorm alternate names and search both — components hide under different names (Navigation Menu → Navbar/AppBar; Dialog → Modal; Combobox → Autocomplete; Accordion → Collapsible/DisclosureGroup). Web-search `"headless {component} component"` and the alternates; review the first ~20 results of each. Include an **"Alternative-Named Implementations"** section for anything found under other names (niche libs often have better patterns — React Arborist for tree, Embla for carousel).

### 2. Check QDS first (authoritative for naming and anatomy)

```bash
ls ~/dev/open-source/qwik-design-system/libs/components/src/{component}/
```

The folder listing IS the part inventory (e.g. textbox → root, label, input, textarea, field, description, error). Read the root file, the browser test, and any research.mdx/note.md. QDS docs are stale; the code is the judge. Then check our own repo: does the family or a related primitive already exist under `packages/headless/components/src/`? Does it compose another family (the way navbar wraps popover)? Composition inherits the composed family's API — do not re-invent it.

### 3. Research headless libraries

WebFetch in parallel batches of 4-5. Try `/llms.txt` or `/llms-full.txt` first (e.g. `https://base-ui.com/llms-full.txt`).

**Tier 1 (always):** Base UI, Ark UI, React Aria, Ariakit, Bits UI, Kobalte.
**Tier 2 (all):** Radix UI, Melt UI, Corvu, Headless UI, Dice UI.
**Tier 3 (time permitting):** Angular CDK/Material, Fritz2, Shadcn, Flux UI.

For each library that has the component: structure (parts), per-part props, ARIA roles/attributes, keyboard interactions, and the version/date viewed. Note libraries checked that lack it.

### 4. Accessibility specs and experts

WAI-ARIA (`w3.org/TR/wai-aria/`), WCAG; treat the ARIA APG as a starter guide, not production truth. Search component-specific posts: Adrian Roselli, Scott O'Hara, Sarah Higley, Heydon Pickering, Sara Soueidan, Val Head, Marcy Sutton, Amberley Romo (`"{component}" site:{domain}`).

### 5. GitHub implementations (grep MCP — required)

Run 5-10 targeted `searchGitHub` queries (TypeScript/TSX): ARIA role usage, keyboard handler patterns, aria-* combinations, part naming in the wild, anti-patterns. Capture common patterns, clever approaches, and anti-patterns in the document. If the grep MCP tool is unavailable, enable it before continuing; record a research blocker only if that fails.

### 6. Expected screen reader behavior

Derive announcements from the ARIA semantics — do not run screen readers. For each key interaction, write the expected announcement (focus, state change, position/group), noting known VoiceOver vs NVDA/JAWS differences from specs or expert posts. Guidepup (`guidepup.dev`) is the reference if we later automate.

### 7. Write research.md

Flexible structure; typical sections: metadata (research date, library versions), research links, feature checklist, component structure (parts), keyboard interactions, ARIA attributes, screen reader announcements, API design, accessibility insights, common patterns, unique approaches, use cases, CSS considerations, open questions.

## Markless API conventions (the API Design section MUST follow these)

- **Parts:** lowercase compound namespaces (`checkbox.root`, `checkbox.trigger`); PascalCase components aliased lowercase via `export * as {family}`. Canonical roles: root, trigger, content, item, label, area, error, description, field (+ indicator, track, thumb, input, textarea where QDS uses them). `field` replaces QDS `hidden-input`. Never invent a part name — match the QDS folder or say why in the document.
- **State:** one `shared()` widget-instance factory per family (`{ scope: 'widget' }`), internal only — never surfaced in the API. A widget root is always an instance boundary; parts resolve to the innermost enclosing root of their family.
- **Props:** `PropsOf<Tag>` for the host element surface; destructuring defaults on the root signature state what an omitted prop means; `{...rest}` first on every host element. No `bind:*`, no useBindings, no controlled/uncontrolled prop splits.
- **Callbacks:** `onChange` (no `$` suffix) for the primary state change — a plain optional function-typed property on the factory return, seeded by the root. Handler composition is authored closures (`onClick={(e) => { x.toggle(); onClick?.(e); }}`), never handler arrays.
- **State attributes:** `ui-*` presence attributes (`ui-checked`, `ui-disabled`, `ui-mixed`); no `data-*`, no `ui-qds-*` identity attributes, no key-value state strings unless genuinely multi-valued.
- **Ids:** `element()` minted handles for `for`/`aria-labelledby`/`popovertarget` wiring — never string ids in the API.
- **Platform-first CSS:** native popover attribute and CSS anchor positioning over JS floating/portal machinery; note which library patterns are workarounds for missing platform APIs.

## Tests (plan them in the document)

Colocated `src/{family}/{family}.browser.ts` (real Chromium, vitest browser mode), consumer scenario components under `src/{family}/scenarios/` (`{family}-basic.tsrx` first, then realistic prop-state scenarios, special cases last — recursion for tree-shaped families), part-role testids, CSR/SSR mode-loop for shared rows, explicit SSR+resume rows for state and gesture behavior.

## Tips

Parallelize fetches; llms.txt first; Tier 1 wins disagreements; consistency across libraries indicates best practice; accessibility and keyboard behavior over visual design; edge cases (empty, disabled, async) reveal quality; record versions and dates.
