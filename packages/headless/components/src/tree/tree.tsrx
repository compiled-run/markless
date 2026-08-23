import { computed, element, shared, state } from '@markless/core';
import type {
	TreeInstanceState,
	TreeItemContentProps,
	TreeItemIndicatorProps,
	TreeItemInstanceState,
	TreeItemLabelProps,
	TreeItemProps,
	TreeItemTriggerProps,
	TreeLabelProps,
	TreeRootProps,
} from './tree-types.ts';

export const treeState = shared(
	() => {
		const tree: TreeInstanceState = state({ disabled: false });

		return { ...tree };
	},
	{ scope: 'widget' },
);

// Rooted by every `tree.item`, including one written inside another item's
// content: a node's own parts read this instance, the nodes below root their own.
export const treeItemState = shared(
	() => {
		const item: TreeItemInstanceState = state({ open: false, leaf: false, level: 1 });
		const labelEl = element<HTMLSpanElement>();

		return {
			...item,
			labelEl,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((open: boolean) => void) | undefined,
			toggle() {
				if (item.leaf) return;
				item.open = item.open !== true;
				item.onChange?.(item.open);
			},
		};
	},
	{ scope: 'widget' },
);

export function TreeRoot({
	disabled = false,
	children,
	onFocusin,
	onKeydown,
	...rest
}: TreeRootProps) @{
	const tree = treeState();
	tree.disabled = disabled;

	// The container holds the tree's only tab stop until focus has been inside it
	// once. `focusin` then takes it out of the tab order, so Shift+Tab out of the
	// first row leaves the tree instead of being caught and sent back in.
	//
	// Every keystroke in the tree is handled HERE rather than on the row it landed
	// on. A handler declared on `tree.item` is matched as an event record and its
	// symbol is then never woken, so its body never runs - measured on this tip,
	// see note.md. That is what keeps the toggling on the DOM as well.
	<div
		{...rest}
		role="tree"
		tabindex={0}
		ui-disabled={tree.disabled}
		onFocusin={(event) => {
			// `target`, not `currentTarget`: a lazy handler symbol runs after the
			// native dispatch has finished, and `currentTarget` is null by then.
			const target = event.target as HTMLElement;
			const root = target.closest('[role="tree"]') as HTMLElement | null;
			const row = target.closest('[role="treeitem"]') as HTMLElement | null;

			if (root && target === root) {
				// Tabbing onto the container hands focus to the remembered row, or to
				// the first one nothing has visited yet.
				const visible = Array.from(
					root.querySelectorAll<HTMLElement>('[role="treeitem"]'),
				).filter((one) => !one.closest('[role="group"][hidden]'));
				const remembered = visible.find((one) => one.getAttribute('tabindex') === '0');
				(remembered ?? visible[0])?.focus();
			} else if (root && row) {
				// Roving. Container and rows render their tabindex as literals, so the
				// framework writes each once and these are the only moves afterwards.
				root.setAttribute('tabindex', '-1');
				for (const one of root.querySelectorAll<HTMLElement>('[role="treeitem"]')) {
					one.setAttribute('tabindex', one === row ? '0' : '-1');
				}
			}

			onFocusin?.(event);
		}}
		onKeydown={(event) => {
			// Guarded by event fields alone: a browser-critical policy has to be
			// readable before the handler symbol loads. Enter and Space are absent on
			// purpose - the row's own trigger is a native button.
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'ArrowRight' ||
				event.key === 'ArrowLeft' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const key = event.key;
			const target = event.target as HTMLElement;
			const root = target.closest('[role="tree"]') as HTMLElement | null;
			if (!root) {
				onKeydown?.(event);
				return;
			}

			// DOM order is the navigation order, and a row inside a closed group is
			// not in it. No registry holds either fact: the walk needs an ordered
			// collection of the tree's rows, which no primitive builds today. Pending
			// capability: ordered item registration into an ancestor widget instance.
			const rows = Array.from(root.querySelectorAll<HTMLElement>('[role="treeitem"]')).filter(
				(row) => !row.closest('[role="group"][hidden]'),
			);
			const here = target.closest('[role="treeitem"]') as HTMLElement | null;

			if (!here) {
				// Focus is on the container itself: the first move enters the tree.
				if (key === 'ArrowDown' || key === 'Home' || key === 'ArrowRight') rows[0]?.focus();
				onKeydown?.(event);
				return;
			}

			// The row's own trigger, and only its own. Clicking "the first focusable
			// inside" is the heuristic that follows a link instead of opening a folder.
			const found = here.querySelector('[ui-treeitemtrigger]') as HTMLElement | null;
			const trigger = found && found.closest('[role="treeitem"]') === here ? found : null;
			// The row reports its own open state, so the walk never needs an instance
			// it cannot reach: a leaf carries no aria-expanded at all.
			const expanded = here.getAttribute('aria-expanded');
			const at = rows.indexOf(here);
			const last = rows.length - 1;
			let next: HTMLElement | null = null;

			if (key === 'ArrowDown') next = rows[at + 1] ?? null;
			else if (key === 'ArrowUp') next = rows[at - 1] ?? null;
			else if (key === 'Home') next = rows[0] ?? null;
			else if (key === 'End') next = rows[last] ?? null;
			else if (key === 'ArrowRight') {
				// Two phases, and never one keystroke doing both: a closed node opens
				// and focus stays put, an open node hands focus to its first child, a
				// leaf does nothing.
				if (expanded === 'false') trigger?.click();
				else if (expanded === 'true') {
					// An open node with nothing in it moves nowhere, where a plain step
					// would have walked to a sibling - so the next row has to be INSIDE
					// this one. Containment rather than a child selector, because the arm
					// and loop wrappers a scenario needs sit between them.
					const below = rows[at + 1];
					next = below && here.contains(below) ? below : null;
				}
			} else if (key === 'ArrowLeft') {
				if (expanded === 'true') trigger?.click();
				else next = here.parentElement?.closest('[role="treeitem"]') ?? null;
			} else if (target === here && (key === 'Enter' || key === ' ')) {
				// Gated on the row itself: a native button inside the row activates
				// itself, and handling the key here as well would toggle the node twice.
				trigger?.click();
			} else if (target === here && key.length === 1) {
				// Typeahead over the visible rows, matched on each row's own label. The
				// buffer and the moment its last key landed live on the container
				// element, and a clock comparison replaces a pending timer so nothing is
				// outstanding across resume.
				const now = Date.now();
				const since = Number(root.getAttribute('ui-typeahead-at') ?? '0');
				const buffer = root.getAttribute('ui-typeahead') ?? '';
				const search = (now - since > 750 ? key : buffer + key).toLowerCase();
				root.setAttribute('ui-typeahead', search);
				root.setAttribute('ui-typeahead-at', String(now));
				// A continued search re-reads the row it is standing on; a fresh one
				// starts at the next row, so typing the same letter walks forward.
				const from = search.length > 1 ? at : at + 1;
				const order = rows.slice(from).concat(rows.slice(0, from));
				next =
					order.find((row) => {
						const named = row.querySelector('[ui-treeitemlabel]') as HTMLElement | null;
						const own = named && named.closest('[role="treeitem"]') === row ? named : null;
						const text = (own ? own.textContent : row.textContent) ?? '';
						return text.trim().toLowerCase().startsWith(search);
					}) ?? null;
			}

			if (next) next.focus();
			onKeydown?.(event);
		}}
	>{children}</div>
}

// The tree's own heading. It cannot name the tree it heads today - an IDREF
// handle read on a widget root is MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT - so
// the consumer writes `aria-label` on the root.
export function TreeLabel({ children, ...rest }: TreeLabelProps) @{
	<span {...rest}>{children}</span>
}

export function TreeItem({
	open = false,
	leaf = false,
	level = 1,
	onChange,
	children,
	...rest
}: TreeItemProps) @{
	const item = treeItemState();
	item.onChange = onChange;
	item.open = open;
	item.leaf = leaf;
	item.level = level;
	// One graph cell per attribute: an inline comparison in an attribute renders
	// once and then goes stale.
	const isClosed = computed(() => item.leaf !== true && item.open !== true);
	const isShowing = computed(() => item.leaf !== true && item.open === true);

	// aria-expanded the way WAI-ARIA asks: a closed parent reports "false", a leaf
	// reports nothing, or a reader cannot tell the two apart.
	<div
		{...rest}
		role="treeitem"
		aria-expanded={isShowing ? 'true' : isClosed ? 'false' : undefined}
		aria-level={item.level}
		tabindex={-1}
		ui-open={isShowing}
		ui-closed={isClosed}
		ui-leaf={item.leaf}
	>{children}</div>
}

export function TreeItemTrigger({ children, onClick, ...rest }: TreeItemTriggerProps) @{
	const tree = treeState();
	const item = treeItemState();

	// tabindex -1: the row is the tab stop, and a second stop per node would give a
	// tree of 200 files 400 of them. `ui-treeitemtrigger` is anatomy - it is how the
	// root's keyboard finds THIS row's trigger rather than the first link in it.
	<button
		{...rest}
		type="button"
		ui-treeitemtrigger=""
		tabindex={-1}
		aria-labelledby={item.labelEl}
		disabled={tree.disabled}
		ui-open={item.open}
		ui-closed={item.open !== true}
		onClick={(event) => {
			item.toggle();
			onClick?.(event);
		}}
	>{children}</button>
}

export function TreeItemContent({ children, ...rest }: TreeItemContentProps) @{
	const item = treeItemState();
	// One graph cell, read in every position: this part renders children that root
	// instances of the same family, and an inline comparison does not survive that.
	const isShowing = computed(() => item.open === true);

	// Closed hides the group, it never detaches it: a widget root inside an arm that
	// flips at runtime is MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED, and every node in
	// here is one.
	<div
		{...rest}
		role="group"
		hidden={isShowing !== true}
		ui-open={isShowing}
		ui-closed={isShowing !== true}
	>{children}</div>
}

export function TreeItemLabel({ children, ...rest }: TreeItemLabelProps) @{
	const item = treeItemState();

	<span {...rest} el={item.labelEl} ui-treeitemlabel="">{children}</span>
}

export function TreeItemIndicator({ children, ...rest }: TreeItemIndicatorProps) @{
	const item = treeItemState();

	// Decorative: the row beside it already reports the state to a reader.
	<span
		{...rest}
		aria-hidden="true"
		ui-open={item.open}
		ui-closed={item.open !== true}
	>{children}</span>
}
