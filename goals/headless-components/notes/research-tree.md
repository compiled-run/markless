# Tree — component research for `@markless/ui`

**Research date:** 2026-08-23
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**Branch read for Markless facts:** `feat/headless-ui-pilot` @ `fc66d3f9`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/tree/` (READ-ONLY),
including its own `research.md` dated 2026-03-14
**Cluster note:** tree is the family **recursion** was landed for. §6 cites the receipts.

---

## 1. Name and alternates

Searched under: tree, tree view, treeview, file tree, folder tree, navigation tree, disclosure
group, accordion tree, outline, hierarchy, treegrid, nested list.

- **Tree view** is the APG's name and Ark's; **TreeView** is Primer's and MUI X's; **Tree** is
  QDS's, Radix's (absent), React Arborist's and `react-component/tree`'s. All the same family.
- **Treegrid** is a *different, heavier* pattern — rows and grid cells — and QDS's own research.md
  quotes Adrian Roselli's warning against it verbatim: *"You should probably ignore ARIA grid unless
  you are trying to recreate Excel"*, treegrid has *"worse support"* than grid, and its arrow keys
  *"override expected navigation patterns, confusing users"*. QDS's tree used to be a treegrid and
  its research talked it out of that. **Do not re-open it.**
- **Accordion / disclosure group** is a flat list of independently-expandable sections. A tree is
  recursive and has a single roving tab stop. Different family; ours is `collapsible`, already
  landed.
- **Alternative-named implementations** worth naming, per the SKILL's instruction that niche
  libraries often have better patterns here:
  - **React Arborist** — virtualised, drag-and-drop, inline rename. Data-driven, not compositional.
  - **Headless Tree** (`lukasbach/headless-tree`) — the successor to `react-complex-tree`;
    framework-agnostic core with a feature-plugin model (selection, drag, search, rename).
  - **MUI X TreeView** — compositional *and* data-driven; its
    `TreeViewChildrenItemProvider.tsx` shows up in the grep sample doing a genuinely clever
    depth-limited descendant query (§5).
  - **Primer TreeView** — GitHub's file explorer; pure `tree`/`treeitem`, and the source of the
    `useRovingTabIndex` tests in the grep sample.

---

## 2. QDS reference (naming truth)

Folder listing — this *is* the part inventory:

```
tree-root.tsx            tree-item.tsx             tree-item-content.tsx
tree-label.tsx           tree-item-trigger.tsx     tree-item-label.tsx
tree-item-indicator.tsx  tree-utils.ts
index.ts   tree.browser.tsx   research.md
```

`index.ts`:

```ts
export { TreeRoot          as root }          from "./tree-root";
export { TreeLabel         as label }         from "./tree-label";
export { TreeItem          as item }          from "./tree-item";
export { TreeItemContent   as itemcontent }   from "./tree-item-content";
export { TreeItemTrigger   as itemtrigger }   from "./tree-item-trigger";
export { TreeItemLabel     as itemlabel }     from "./tree-item-label";
export { TreeItemIndicator as itemindicator } from "./tree-item-indicator";
```

**Seven parts.** No `.css` file — tree is the one QDS family that ships no stylesheet.

### What QDS actually implements

| Concern | QDS behaviour (from the code) |
| --- | --- |
| Root | `role="tree"`, `ui-qds-tree-root`; provides two contexts: `TreeRootContext` (root ref, `currentFocusEl`, typeahead buffer + timeout) and a `TreeGroupContext` (`currItemIndex`, `totalItems`) |
| Item | composes `CollapsibleRoot`; `role="treeitem"`, `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded` (only when open — `isOpen \|\| undefined`), `aria-selected={props['aria-selected'] ?? false}`, `ui-level`, `ui-highlighted`, `disableUntilFound`, `data-group` |
| Item content | composes `CollapsibleContent` with `role="group"`, **and re-provides `TreeGroupContext`** with a fresh counter, so each nested group counts its own children |
| Item trigger | composes `CollapsibleTrigger` with `tabIndex={-1}` and `aria-labelledby={itemId}-label` |
| Item label | a `<span id="{itemId}-label" tabindex="-1">` |
| Item indicator | a bare `<span>` with no state at all |
| Level | `getCurrentLevel(parentContext?.level)` — read from the nearest enclosing item's context, so nesting is by **composition**, not by a data prop |
| Roving tabindex | on the **item row**: `0` when it is the focused element or nothing is focused yet, `-1` otherwise |
| Keyboard | handled on the item, gated on `e.target === itemRef` so a focusable inside the row does not trigger it |
| Navigation | pure DOM walks in `tree-utils.ts` over `[ui-qds-tree-item]`, skipping anything inside `[ui-qds-collapsible-content][hidden]` |
| Typeahead | `handleTypeaheadKey` over a shared buffer + a `window.setTimeout` handle held in a signal |

The keyboard model, key by key:

| Key | QDS behaviour |
| --- | --- |
| `ArrowDown` / `ArrowUp` | next / previous **visible** item, by DOM walk |
| `ArrowRight` | if collapsed, expand; else if the row holds more than one focusable, focus the first one |
| `ArrowLeft` | if expanded, collapse; else focus the parent item |
| `Home` / `End` | first / last visible item |
| `Enter` / `Space` | click the first focusable inside the row |
| printable | typeahead over visible item text |
| `Tab` | explicitly ignored, so it leaves the tree |

Six navigation keys plus Space are `preventDefault`ed in a `sync$` handler — the same
"browser-critical policy must be readable before the handler symbol loads" reasoning the landed tabs
family writes out at `tabs.tsrx:113`.

`tree.browser.tsx` carries 33 tests.

### Things to fix rather than copy

1. **`aria-selected={props['aria-selected'] ?? false}` on every item, unconditionally.** Every node
   in a QDS tree reports `aria-selected="false"` even when the tree has no selection concept at
   all. The APG's rule is that `aria-selected` is for trees that *have* selection; on a pure
   disclosure tree it makes every node announce a selection state that does not exist. **Emit it
   only when the family is in a selecting mode.**
2. **`aria-expanded` is emitted only when open** (`isOpen || undefined`). Backwards: the APG says
   `aria-expanded="false"` is *required* on a collapsed parent and must be **omitted from end
   nodes**. QDS's version cannot distinguish "collapsed parent" from "leaf", so a reader announces
   both identically and a person cannot tell there is anything to open.
3. **No `aria-multiselectable` and no selection model.** Consistent with (1) — the family is a
   disclosure tree wearing selection attributes.
4. **The item trigger is `tabIndex={-1}` and the row is the tab stop, but `Enter`/`Space` on the row
   clicks "the first focusable inside".** That is a heuristic. If a row holds a link *before* the
   expand trigger, `Enter` follows the link instead of expanding. `ArrowRight`'s
   `countFocusablesWithin(currentItem) > 1` branch has the same shape.
5. **`aria-labelledby` on the trigger points at `{itemId}-label`, which only exists if
   `tree.itemlabel` was mounted.** Same dangling-IDREF class of defect as radio group's group name
   (`research-radio-group.md` §2) and select's trigger (`research-select.md` §2.2).
6. **Typeahead holds a `window.setTimeout` handle in a signal.** Works, but a timer is exactly the
   thing `research-popover.md` §7.1 R13 records as **unproven across resume** for us. Select's
   answer — two cells and a `Date.now()` comparison, no timer — applies here identically.
7. **`disableUntilFound` on the item.** QDS turns off `hidden="until-found"` for tree rows. Worth
   understanding before copying: `until-found` lets in-page find reveal collapsed content, which is
   a genuine accessibility win in a file tree, and turning it off is a deliberate trade whose reason
   is not stated in the code.

---

## 3. Headless library survey

| Library | Has a tree? | Structure | Recursion model |
| --- | --- | --- | --- |
| **Base UI** | **No** | | |
| **Radix** | **No** | | |
| **Ariakit** | **No** | | |
| **Kobalte / Bits / Melt / Corvu / Headless UI** | **No** | | |
| **React Aria** | Yes (`Tree`, `TreeItem`, `TreeItemContent`) | grid-based underneath (`useGridListItem`) | children |
| **Ark UI** | Yes | `Root, Label, Tree, NodeProvider, Branch, BranchControl, BranchTrigger, BranchIndicator, BranchText, BranchContent, BranchIndentGuide, Item, ItemText, ItemIndicator, NodeCheckbox, NodeRenameInput` | **collection-driven**: `collection={createTreeCollection(...)}`, not recursive children |
| **Primer** | Yes | `TreeView`, `TreeView.Item`, `TreeView.SubTree` | children |
| **MUI X** | Yes | `SimpleTreeView` (children) and `RichTreeView` (`items` prop) | both |
| **QDS** | Yes | 7 parts (§2) | **children, by composition** |
| **Headless Tree / React Arborist** (alternative-named) | Yes | hook + data | data |

The split that matters: **Ark and the data-driven libraries take a `collection` prop and render the
tree for you; QDS, Primer, React Aria and MUI's simple variant take recursive children.** Ark's own
docs say it plainly — "uses a collection-based approach rather than recursive children rendering",
with `TreeCollection<T>`, `createTreeCollection()`, and `remove()`/`replace()` for updates.

**We take recursive children.** Three reasons: it is what QDS does, and QDS-is-the-API is the
standing order; a `collection` prop is a data structure crossing the authoring surface, which is a
new concept rather than a part; and — decisively — **recursion is the capability this branch
landed** (§6), so composition is the shape the framework can now prove.

Agreement on the ARIA shape is total among the tree-role libraries: `role="tree"` on the container,
`role="treeitem"` per node, `role="group"` on the nested list, `aria-expanded` on parents, roving
tabindex with one tab stop. React Aria is the outlier (grid roles), and QDS's own research already
rejected that route on Roselli's advice.

Ark's keyboard table, for comparison against QDS's (§2): `Tab` focuses the first item;
`Enter`/`Space` selects or toggles; `ArrowDown`/`ArrowUp` navigate; `ArrowRight` expands or moves
in; `ArrowLeft` collapses or moves to parent; `Home`/`End` jump; `A`–`Z` typeahead;
`Shift`+arrow extends selection; `Ctrl+A` selects all. The last two are the selection model QDS does
not have.

---

## 4. WAI-ARIA, aria-at, and expected screen-reader behaviour

### 4a. The APG tree view pattern

Read `w3.org/WAI/ARIA/apg/patterns/treeview/`, 2026-08-23.

**Roles:** `tree` (container), `treeitem` (each node), `group` (the container of a node's children).

**Attributes:**

| Attribute | Rule |
| --- | --- |
| `aria-expanded` | **required on parent nodes**, `false` when closed and `true` when open; **omitted from end nodes** |
| `aria-multiselectable` | `true` for multi-select; defaults to `false` |
| `aria-label` / `aria-labelledby` | **required on the tree container** |
| `aria-selected` **or** `aria-checked` | one of the two, used consistently, and only in a tree that has selection |
| `aria-level`, `aria-setsize`, `aria-posinset` | specify **when the DOM does not fully represent the hierarchy** |
| `aria-owns` | for children that are not DOM descendants |
| `aria-orientation` | `horizontal` for non-default layouts |

That `aria-level`/`aria-setsize`/`aria-posinset` rule is the one most implementations get
backwards, QDS included: it emits all three **always**, even though its DOM *does* fully represent
the hierarchy (nested `role="group"` containers). Emitting them redundantly is not harmful, but
emitting them **wrongly** is, and a hand-maintained counter is a thing that can go wrong. See §7.

Keyboard:

| Key | Required behaviour |
| --- | --- |
| entering the tree | focus the first node, or the previously selected node |
| `ArrowRight` | closed node → open it; open node → move to its first child; end node → nothing |
| `ArrowLeft` | open node → close it; child or end node → move to its parent |
| `ArrowDown` / `ArrowUp` | next / previous focusable node, **without** expanding or collapsing |
| `Home` / `End` | first / last focusable node |
| `Enter` | activate — expand/collapse a parent, or select in a single-select tree |
| type-ahead | move to the next node whose name starts with the typed characters |
| `*` (asterisk) | *optional* — expand every sibling at the current level |
| `Space` | multi-select only — toggle the focused node |
| `Shift+ArrowDown/Up`, `Ctrl+A` | optional multi-select extensions |

QDS implements every required row. It does not implement `*`, and its `Enter` clicks a descendant
rather than expanding directly (§2.4).

### 4b. aria-at coverage — **absent**

`w3c/aria-at`, `tests/apg/` directory listing read 2026-08-23 (the 40 plans are enumerated in
`research-carousel.md` §4b and are not repeated here). **There is no treeview plan, and no
treegrid plan.** The nearest neighbours are `disclosure-faq` and `disclosure-navigation`, which
cover a single `aria-expanded` button and its panel — that is one node of a tree, with no level, no
set position, and no roving tab stop.

So: **no community-vetted assertion set exists for this family at any priority.** Everything in §4c
is derived from the ARIA semantics per the SKILL's rule and must be labelled as ours.

### 4c. Expected announcements — derived, not borrowed

Reference shape: a tree named "Project files" with `src` (containing `index.ts`, `app.tsrx`) and
`README.md` at the top level.

**Sequence A — Tab into the tree**

1. keypress `Tab`
2. → "Project files"
3. → "tree"
4. → "src"
5. → "collapsed" — **from `aria-expanded="false"`.** This is the row QDS fails: with
   `aria-expanded` omitted while closed, a reader announces "src" as a leaf and there is no signal
   that anything can be opened.
6. → "1 of 2" — set position among *siblings*, and "level 1"

**Sequence B — `ArrowRight` on a collapsed parent**

1. → "expanded". State change only; focus does not move.
2. → nothing about the children yet.

**Sequence C — `ArrowRight` again, now on an expanded parent**

1. → "index.ts"
2. → "1 of 2"
3. → "level 2" — **the level change is the whole point.** A tree whose `aria-level` does not
   increment announces a flat list, which is the single most common tree defect.

**Sequence D — `ArrowLeft` from a child**

1. → "src"
2. → "expanded", "1 of 2", "level 1"

**Sequence E — `ArrowDown` across a collapsed boundary**

From `src` collapsed, `ArrowDown` lands on `README.md` — the children are skipped because they are
inside a hidden group. The reader says "README.md, 2 of 2, level 1". The row that catches a
navigation walk that forgets to skip hidden content.

**Sequence F — arriving at a leaf**

1. → "README.md" → "2 of 2" → "level 1"
2. → **no** "collapsed" and no "expanded", because a leaf carries no `aria-expanded`.
3. → **no** "not selected", because a disclosure tree carries no `aria-selected`. This is the row
   that catches §2.1.

**Not derivable and therefore not asserted:** how readers narrate the `*` expand-siblings key, and
how JAWS's virtual cursor treats `hidden="until-found"` groups. The `disableUntilFound` question in
§2.7 sits behind that second gap.

---

## 5. GitHub patterns (grep MCP)

`role="treeitem"` (TSX) returns a rich sample, and it splits cleanly.

- **DOM-walk navigation is the norm, and it looks like ours.** `redpanda-data/console`'s
  `catalog-tree.tsx` handles six keys with
  `e.currentTarget.querySelectorAll('[role="treeitem"]:not(:disabled)')`, indexes into it, and
  focuses. `MonitoRSS`'s `NavigableTreeItemContext.tsx` walks with
  `groupChildElem.querySelector('[role="treeitem"]')` and
  `currentTreeItem.parentElement?.closest('[role="treeitem"]')` for the parent hop — the exact two
  moves `ArrowRight`/`ArrowLeft` need. **No registry anywhere in the sample.**
- **`primer/react`'s `useRovingTabIndex.test.tsx`** builds its fixtures as literal markup, and that
  markup is the canonical shape:
  `<ul role="tree"><li role="treeitem" aria-expanded="true"><ul role="group"><li role="treeitem">…`.
  Worth copying as our scenario shape.
- **`mui/mui-x`'s `TreeViewChildrenItemProvider.tsx`** carries the cleverest query in the sample —
  a descendant selector that excludes grandchildren:
  `[role="treeitem"]:not([id="X"] [role="treeitem"] [role="treeitem"])`. That is how you count
  *direct* children for `aria-setsize` from the DOM with no counter. Directly reusable, and it is
  the alternative to QDS's construction-order counter (§7).
- **Anti-patterns in the sample:**
  - `Stirling-PDF`'s `FolderTreeSidebar.tsx` and `hydralauncher/hydra` both write
    `aria-selected="false"` on every node of a non-selecting tree — the same defect as §2.1, in the
    wild.
  - `Stirling-PDF` also gives **every** treeitem `tabIndex={0}`: no roving tab stop, so a tree of
    200 files is 200 tab stops. The tree equivalent of the radio-group anti-pattern
    `research-radio-group.md` §5 found.
  - `zeroclaw`'s `SectionNavigator.tsx` uses `aria-current="page"` on treeitems, mixing the
    navigation-tree idiom into a plain tree. The APG *does* bless `aria-current` in its navigation
    treeview example, so this is defensible — but it means "selected" and "current" are two
    different concepts a tree can carry, and the family should not conflate them.
  - `toeverything/AFFiNE`'s virtual scroller writes `role="treeitem"` on rows inside a
    virtualised list, which breaks `aria-setsize`/`aria-posinset` unless they are supplied
    explicitly — which it does (`aria-level={row.depth + 1}`). That is the APG's "when the DOM does
    not fully represent the hierarchy" case, correctly handled.

---

## 6. Recursion — landed, with receipts

This is the capability the family exists to use, and it landed on this branch. Two paired tests
pin it.

### 6a. The rendered consequence

`packages/vitest-browser/browser/recursive-self-composition.test.ts`, over
`fixtures/tree-node.tsrx` and `fixtures/tree-page.tsrx`. Its header states the contract:

> A PLAIN component that composes itself: no `shared()`, no widget. The chunk graph has a cycle, and
> how far it unrolls is decided at render time by a prop. Each level is one more component edge, so
> it renders under its own `c<n>:` instance path: its own payload nodes, its own `state()`, and its
> own symbol route back to that level.

The fixture is exactly a tree node:

```tsx
export default function TreeNode({ depth }) @{
	let count = state(0);

	<div data-tree-node data-depth={depth}>
		<button type="button" data-tree-bump onClick={() => count++}>{count}</button>
		@if (depth > 0) {
			<TreeNode depth={depth - 1} />
		}
	</div>
}
```

Three tests pass on it:

- **`CSR: a self-composing component unrolls to the depth its prop names`** — three nested levels,
  each containing the next, and the innermost holds no further node.
- **`CSR: each unrolled level owns its own state`** — clicking level 1's counter twice and level 0's
  once gives `['1', '1', '2']`. **Per-level state isolation, witnessed.**
- **`SSR resume: the unrolled tree renders on the server and resumes per level`** — the same two
  assertions after `renderSSR`, so the recursion survives the resume boundary.

### 6b. The emitted-module consequence

`packages/compiler/test/recursive-self-composition.test.ts` pins the compiler side:

> the emitted module reaches its own render function through the same child call any imported child
> takes, so each level is one more component edge with its own `c<n>:` node identity, state, and
> symbol route.

It tests three shapes, not one — which is what makes it a receipt rather than a fixture:

1. direct self-composition (the `TreeNode` above);
2. **an alternate spelling** — "the same shape with every authored name, element, attribute, and
   prop changed: nothing may be selected by the fixture's own spelling" (a `Crumb` component with
   `left`, `<section>`, `<a>`);
3. **mutual recursion within one module** — `Outer` renders `Inner` renders `Outer`, "the cycle runs
   through the module's own root, which is the same edge shape as direct self-composition".

The relevant commit is `e21eb464`, *"merge: recursion regression fix + component-tag spreads
(T072)"*.

### 6c. What the receipts do and do not license

**They license:** `tree.item` containing `tree.itemcontent` containing more `tree.item`s, written as
ordinary composition, with each level holding its own state, in CSR and after SSR resume.

**They do not license three things this family needs, and each is a named risk:**

1. **The recursion is behind an arm decided by a *prop*.** Both test files say so explicitly — "how
   far it unrolls is decided at render time by a **prop**... so the arm never flips at runtime". A
   tree's `@if (item.open)` arm **does** flip at runtime, and a widget-root part inside a flipping
   arm is refused today with `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED` (per
   `packages/headless/components/src/otp/note.md`, "Boxes from an arm"). **Our recursion must
   therefore not use an arm for open/closed** — it must render the group always and hide it with
   `hidden`, exactly the way the landed `tabs.content` keeps panels mounted
   (`tabs.tsrx:168`, *"Hidden hides the panel, it never detaches it"*). That is also what
   `research-popover.md` §7.2 recommends for overlays and what QDS's collapsible does. **One rule,
   four families.**
2. **The fixtures use `state()`, not `shared({ scope: 'widget' })`.** `tree.item` roots a widget
   instance. Recursive *widget* rooting — a widget root inside a widget root of the same family, at
   arbitrary depth — is the exact shape `fixtures/nst.tsrx` describes ("the parts placed in a root's
   children belong to the INNERMOST root that encloses them") but is not what these three tests
   assert. **This is the family's first spike.**
3. **The children come from composition, not a keyed `@for`.** A real tree is authored over data.
   Widget parts inside `@for` remain unproven for every family in the tranche.

### 6d. Level, set size, and position — no counter needed

QDS gets `aria-level` from `getCurrentLevel(parentContext?.level)` and `aria-posinset`/`aria-setsize`
from a per-group construction-order counter re-provided by each `tree.itemcontent`. Markless seeds
are order-independent by design, so the counter route is closed for us — the same ruling tabs, radio
group, select and otp all took.

Two routes stay open, and both avoid a counter:

- **`aria-level`** falls out of the widget-instance nesting: an item resolves its *parent* item's
  instance and adds one, which is exactly what QDS does through context and what the recursion
  receipts prove works per level.
- **`aria-setsize` / `aria-posinset` do not have to be emitted at all.** The APG says to specify
  them "when the DOM does not fully represent the hierarchy" (§4a), and with nested `role="group"`
  containers ours does. **Recommendation: omit both**, which removes the counter question entirely
  and is more correct than QDS. If a future virtualised tree needs them, MUI X's depth-limited
  descendant query (§5) is the DOM-side answer.

---

## 7. Markless API design

### Parts

`tree.root`, `.label`, `.item`, `.itemtrigger`, `.itemcontent`, `.itemlabel`, `.itemindicator` —
the QDS `index.ts` exactly, with QDS's own lowercase compound spelling.

### Types (`tree-types.ts`)

```ts
import type { ElementHandle, Handler, PropsOf, Seeded } from '@markless/core';

type TriggerProps = PropsOf<'button'>;

export type TreeRootProps = PropsOf<'div'> & {
	/** Nobody can open or close anything. */
	readonly disabled?: boolean;
};

export type TreeItemProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** This node's children are showing. Omit it and it starts closed. */
	readonly open?: boolean;
	/** This node has no children; it reports no open state and never opens. */
	readonly leaf?: boolean;
	/** Called with the new state when a person opens or closes this node. */
	readonly onChange?: (open: boolean) => void;
};

export type TreeItemTriggerProps = Omit<TriggerProps, 'onClick'> & {
	readonly onClick?: Handler<TriggerProps['onClick']>;
};

export type TreeLabelProps         = PropsOf<'span'>;
export type TreeItemContentProps   = PropsOf<'div'>;
export type TreeItemLabelProps     = PropsOf<'span'>;
export type TreeItemIndicatorProps = PropsOf<'span'>;

export type TreeInstanceState = Seeded<TreeRootProps, 'disabled'> & {
	/** Typeahead buffer and the moment its last key landed. Two cells, no timer. */
	search: string;
	searchAt: number;
	labelEl: ElementHandle<HTMLElement>;
};

/** One per rendered `<tree.item>`; its parts and its children read this. */
export type TreeItemState = {
	open: boolean;
	leaf: boolean;
	level: number;
	labelEl: ElementHandle<HTMLElement>;
	rowEl: ElementHandle<HTMLElement>;
};
```

No `selectedValue`, no `selectionMode`, no `aria-selected` in v1. The family is a **disclosure
tree**: it opens and closes, and the consumer puts links or buttons inside the rows for whatever
activation means in their app. That is what QDS actually is once §2.1 is fixed, it is what the APG
navigation-treeview example is, and it is what the grep sample's honest implementations are. A
selecting tree is a second mode and §9 question 3.

`leaf` is an explicit prop rather than inferred from "has no `tree.itemcontent`". Inferring it would
need a child-to-parent seed, and while part-to-root seeds landed (`8f7e5f00`) the question is
whether a *nested widget root* seeds its enclosing root of the same family — the open question in
§6c.2. An explicit prop makes `aria-expanded`'s presence/absence (§4a, the APG's required
distinction) correct on day one without depending on that.

### Sketch

```tsx
export const treeState = shared(() => {
	const tree: TreeInstanceState = state({ disabled: false, search: '', searchAt: 0 });
	const labelEl = element<HTMLElement>();
	return { ...tree, labelEl,
		typed(key: string, now: number) {
			tree.search = now - tree.searchAt > 750 ? key : tree.search + key;
			tree.searchAt = now;
		},
	};
}, { scope: 'widget' });

// Each `tree.item` roots one of these. A nested item resolves its PARENT's
// instance for `level`, then roots its own — the shape the recursion receipts
// in §6 make plausible and the spike in §9 q1 has to confirm.
export const treeItemState = shared(
	() => ({ ...state({ open: false, leaf: false, level: 1 }),
	         labelEl: element<HTMLElement>(), rowEl: element<HTMLElement>() }),
	{ scope: 'widget' },
);

export function TreeRoot({ disabled = false, children, ...rest }: TreeRootProps) @{
	const tree = treeState();
	tree.disabled = disabled;

	<div {...rest} role="tree" ui-disabled={tree.disabled}>{children}</div>
}

export function TreeItem({ open = false, leaf = false, onChange, children, ...rest }: TreeItemProps) @{
	const tree = treeState();
	const item = treeItemState();
	item.open = open;
	item.leaf = leaf;

	<div
		{...rest}
		el={item.rowEl}
		role="treeitem"
		// The APG's rule, and QDS's bug: a collapsed parent MUST say so; a leaf
		// must say nothing.
		aria-expanded={item.leaf ? undefined : item.open ? 'true' : 'false'}
		aria-level={item.level}
		tabindex={-1}
		ui-open={item.open}
		ui-leaf={item.leaf}
		onKeydown={(event) => { /* the APG table, §4a, by DOM walk off event.target */ }}
	>{children}</div>
}

export function TreeItemContent({ children, ...rest }: TreeItemContentProps) @{
	const item = treeItemState();

	// Hidden hides the group, it never detaches it. Detaching is what a flipping
	// `@if` arm would do, and a widget-root child inside a flipping arm is refused
	// today (§6c.1). Same rule the landed tabs panel follows.
	<div {...rest} role="group" hidden={item.open !== true}>{children}</div>
}
```

### Navigation, without a registry

Every move the APG needs is a DOM query off `event.target`, in the idiom the landed tabs handler
already uses (`tabs.tsrx:132`, and the `event.target`-not-`currentTarget` rule from
`packages/headless/components/src/otp/note.md`):

| Move | Query |
| --- | --- |
| next / previous visible | `root.querySelectorAll('[role="treeitem"]')` filtered by `!el.closest('[role="group"][hidden]')`, index and step |
| first / last visible | the same list, ends |
| parent | `row.parentElement.closest('[role="treeitem"]')` — MonitoRSS's exact move (§5) |
| first child | `row.querySelector('[role="group"] > [role="treeitem"]')` |
| typeahead | the visible list, matched against `textContent` |

### What is not expressible today

| Wanted | Blocked by |
| --- | --- |
| `aria-labelledby={tree.labelEl}` on the **root** | `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT`. **This is the tree's accessible name**, which the APG lists as required. Same blocker carousel has (`research-carousel.md` §9 q4) and radio group dodged with `fieldset`/`legend`. A tree has no native equivalent |
| `aria-labelledby={item.labelEl}` on `tree.itemtrigger` | this one is a **part** position, and part-position IDREF handles landed (`fb9e9d01`). Expected to work |
| roving `tabindex` across the whole tree | needs "am I the focused row, or the first row when nothing is focused" — a DOM question the keydown walk already answers. Same shape as radio group's reachability row (`research-radio-group.md` §7) |
| a `tree.item` inside a **flipping** `@if` arm | `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED` — and §6c.1 says do not want this: use `hidden` |

---

## 8. Test plan

`packages/headless/components/src/tree/tree.browser.ts`, scenarios under `src/tree/scenarios/`.
Part-role testids: `root`, `label`, `item`, `itemtrigger`, `itemcontent`, `itemlabel`,
`itemindicator`, prefixed per node in nested scenarios (`src-item`, `src-itemtrigger`,
`index-itemlabel`).

Scenarios, starter first, special cases last:

1. `basic.tsrx` — a flat tree: three leaf items, no nesting. Proves roles, roving tabindex,
   `ArrowDown`/`ArrowUp`/`Home`/`End`, and that leaves carry **no** `aria-expanded` (§4c F).
2. `nested.tsrx` — **the recursion scenario**, two levels deep, hand-written. Asserts `aria-level`
   increments, the nested container is `role="group"`, `ArrowRight` opens then descends,
   `ArrowLeft` collapses then ascends, and `ArrowDown` across a collapsed parent skips its children
   (§4c E).
3. `deep.tsrx` — a **self-composing** `FileNode` component, four levels, the same shape as
   `packages/vitest-browser/browser/fixtures/tree-node.tsrx` but with `tree.item` parts instead of
   plain divs. **This is the spike named in §6c.2**, and it is the row most likely to fail first.
   Keep it and let it name the gap.
4. `file-explorer.tsrx` — realistic: folders and files, a link inside each row, an indicator that
   rotates. Asserts `Enter` on a row does **not** follow the link (§2.4's heuristic, fixed here by
   the trigger owning the toggle).
5. `preopened.tsrx` — a tree with two branches open on first render; asserts the served HTML has
   them open and resume keeps them open.
6. `typeahead.tsrx` — enough visibly-named nodes to type against, plus one inside a **closed**
   branch that must not match.
7. `with-onchange.tsrx` / `without-onchange.tsrx`.
8. `two-trees.tsrx` — two on one page; arrowing in one must not touch the other.
9. `nodes-from-data.tsrx` — nodes authored with a keyed `@for` over a nested array. **Expected to
   fail**; it is the shape every real file tree has (§6c.3).

Mode loop CSR/SSR for the shared rows, with literal `render`/`renderSSR` call sites. Explicit
SSR+resume rows for:

- the served HTML carries the right `aria-expanded` on every parent and none on any leaf;
- `aria-level` is right on the server, before any measurement;
- the first `ArrowRight` after resume opens the node, and the second descends into it;
- a node opened before resume stays open, and its children are reachable by `ArrowDown`.

Keyboard rows must assert the two rules that separate a tree from a list:

- **`ArrowRight` is two-phase** — on a collapsed parent it opens and does not move; on an already-open
  parent it moves to the first child. Both directions, both modes.
- **`ArrowDown` never expands anything** (the APG says so explicitly). A tree whose `ArrowDown`
  expands is the most common tree bug and the cheapest row to write.

A screen-reader lane (`tree.sr.ts`) should carry Sequences A–F from §4c, **labelled as derived**,
since no aria-at plan backs them (§4b).

---

## 9. Open questions

1. **Does a widget root nest inside a widget root of the same family, recursively?** The recursion
   receipts (§6) prove *plain components* self-compose with per-level state, in CSR and after SSR
   resume. They do not prove it for `shared({ scope: 'widget' })` roots, which is what `tree.item`
   is. `fixtures/nst.tsrx` documents the innermost-root rule for the same family, so the design is
   sound in principle. **This is the tranche's highest-value spike for tree specifically**, and it
   blocks the family outright if the answer is no.
2. **Open/closed by `hidden`, not by an `@if` arm — confirm.** §6c.1 argues for `hidden` on three
   independent grounds (the arm refusal, the overlay memo's R4 recommendation, and the landed tabs
   panel). **Recommended: `hidden`.** Wants a one-line ruling so nobody writes the arm version.
3. **Disclosure tree only, or a selection model in v1?** **Recommended: disclosure only.** QDS's
   `aria-selected` is decorative (§2.1); the APG's selection rows are all optional; and adding
   selection adds `aria-multiselectable`, `Space`, `Shift`+arrow and `Ctrl+A` — a second keyboard
   model on a family whose first one is already the largest in the tranche.
4. **Omit `aria-setsize` / `aria-posinset`?** **Recommended: omit**, because our DOM fully
   represents the hierarchy and the APG only asks for them when it does not (§6d). This is a
   deviation from QDS behaviour and is argued, not silent.
5. **`leaf` as an explicit prop, or inferred?** **Recommended: explicit**, because inferring it
   depends on the unresolved child-to-parent seed question and because getting `aria-expanded`'s
   presence right is a required APG rule, not a nicety.
6. **How does the tree get its accessible name?** `aria-labelledby={tree.labelEl}` on the root is
   blocked by `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT`, and a tree has no `fieldset`/`legend`
   equivalent. Same framework question carousel raises. Until it lifts, the only route is a plain
   `aria-label` string through `{...rest}`, which means `tree.label` cannot name the tree it labels.
