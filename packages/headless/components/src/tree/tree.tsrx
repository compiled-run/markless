import { computed, element, shared, state } from '@markless/core';
import { ownPart, parentRow, rowAt, visibleRows } from './tree-walk.ts';
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

// Every keystroke is handled on the root: a handler declared on `tree.item` is matched as an event record and its symbol is never woken.
// One computed() cell per attribute - an inline comparison written in an attribute renders once and then goes stale.

export const treeState = shared(
	() => {
		const tree: TreeInstanceState = state({ disabled: false });
		const rootEl = element<HTMLDivElement>();
		// The array type argument makes a handle plural: bound on every part of its
		// kind, read back as the live elements in document order.
		const rowEls = element<HTMLDivElement[]>();
		const groupEls = element<HTMLDivElement[]>();
		const triggerEls = element<HTMLButtonElement[]>();
		const labelEls = element<HTMLSpanElement[]>();

		return { ...tree, rootEl, rowEls, groupEls, triggerEls, labelEls };
	},
	{ scope: 'widget' },
);

// Rooted by every `tree.item`, so a node written inside another item's content gets its own instance.
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

	// The container is the tree's only tab stop until focus lands inside, so Shift+Tab out of the first row leaves the tree.
	<div
		{...rest}
		el={tree.rootEl}
		role="tree"
		tabindex={0}
		ui-disabled={tree.disabled}
		onFocusin={(event) => {
			// `target`, not `currentTarget`: a lazy handler symbol runs after the native dispatch, when `currentTarget` is null.
			const target = event.target as HTMLElement;
			const root = tree.rootEl;
			if (root === undefined) {
				onFocusin?.(event);
				return;
			}

			if (target === root) {
				const visible = visibleRows(tree.rowEls, tree.groupEls);
				const remembered = visible.find((one) => one.getAttribute('tabindex') === '0');
				(remembered ?? visible[0])?.focus();
				onFocusin?.(event);
				return;
			}

			const row = rowAt(tree.rowEls, target);
			if (row) {
				// Roving is written straight to the DOM: container and rows render tabindex as literals, so nothing else moves it.
				root.setAttribute('tabindex', '-1');
				for (const one of tree.rowEls ?? []) {
					one.setAttribute('tabindex', one === row ? '0' : '-1');
				}
			}

			onFocusin?.(event);
		}}
		onKeydown={(event) => {
			// Enter and Space are absent on purpose: the row's own trigger is a native button and already consumes them.
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
			const root = tree.rootEl;
			if (root === undefined) {
				onKeydown?.(event);
				return;
			}

			// Before the rows are walked: a key this handler never acts on - Tab, Escape,
			// a modifier - must not pay for the walk. Length one is the typeahead's range.
			const isHandledKey =
				key === 'ArrowDown' ||
				key === 'ArrowUp' ||
				key === 'ArrowRight' ||
				key === 'ArrowLeft' ||
				key === 'Home' ||
				key === 'End' ||
				key === 'Enter' ||
				key.length === 1;
			if (!isHandledKey) {
				onKeydown?.(event);
				return;
			}

			// Read at the handler's top level: a shared read inside the typeahead closure below is a ReferenceError.
			const rowEls = tree.rowEls;
			const labelEls = tree.labelEls;
			// Document order is the navigation order, and the family's own rows come back in it.
			const rows = visibleRows(rowEls, tree.groupEls);
			const here = rowAt(rowEls, target);

			if (!here) {
				if (key === 'ArrowDown' || key === 'Home' || key === 'ArrowRight') rows[0]?.focus();
				onKeydown?.(event);
				return;
			}

			// The row's own trigger, and only its own: "first focusable inside" follows a link instead of opening a folder.
			const trigger = ownPart(tree.triggerEls, rowEls, here);
			// A closed node reports no aria-expanded, so the state attribute is what tells it from a leaf.
			const expanded = here.getAttribute('aria-expanded') === 'true';
			const collapsed = here.hasAttribute('ui-closed');
			const at = rows.indexOf(here);
			const last = rows.length - 1;
			let next: HTMLElement | null = null;

			if (key === 'ArrowDown') next = rows[at + 1] ?? null;
			else if (key === 'ArrowUp') next = rows[at - 1] ?? null;
			else if (key === 'Home') next = rows[0] ?? null;
			else if (key === 'End') next = rows[last] ?? null;
			else if (key === 'ArrowRight') {
				if (collapsed) trigger?.click();
				else if (expanded) {
					// Containment, not a child selector: the arm and loop wrappers a scenario needs sit between row and child.
					const below = rows[at + 1];
					next = below && here.contains(below) ? below : null;
				}
			} else if (key === 'ArrowLeft') {
				if (expanded) trigger?.click();
				else next = parentRow(tree.rowEls, here);
			} else if (target === here && (key === 'Enter' || key === ' ')) {
				// Gated on the row itself: the trigger inside it is a native button, and handling here too would toggle twice.
				trigger?.click();
			} else if (target === here && key.length === 1) {
				// The typeahead buffer lives on the element and is aged by a clock read, so no timer is outstanding across resume.
				const now = Date.now();
				const since = Number(root.getAttribute('ui-typeahead-at') ?? '0');
				const buffer = root.getAttribute('ui-typeahead') ?? '';
				const search = (now - since > 750 ? key : buffer + key).toLowerCase();
				root.setAttribute('ui-typeahead', search);
				root.setAttribute('ui-typeahead-at', String(now));
				const from = search.length > 1 ? at : at + 1;
				const order = rows.slice(from).concat(rows.slice(0, from));
				next =
					order.find((row) => {
						const own = ownPart(labelEls, rowEls, row);
						const text = (own ? own.textContent : row.textContent) ?? '';
						return text.trim().toLowerCase().startsWith(search);
					}) ?? null;
			}

			if (next) next.focus();
			onKeydown?.(event);
		}}
	>{children}</div>
}

// Cannot name the tree it heads: an IDREF handle read on a widget root is MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT, so the consumer writes `aria-label` on the root.
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
	const tree = treeState();
	const item = treeItemState();
	item.onChange = onChange;
	item.open = open;
	item.leaf = leaf;
	item.level = level;
	const isClosed = computed(() => item.leaf !== true && item.open !== true);
	const isShowing = computed(() => item.leaf !== true && item.open === true);

	<div
		{...rest}
		el={tree.rowEls}
		role="treeitem"
		aria-expanded={isShowing ? 'true' : undefined}
		aria-selected="false"
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

	// tabindex -1 because the row is the tab stop.
	<button
		{...rest}
		el={tree.triggerEls}
		type="button"
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
	const tree = treeState();
	const item = treeItemState();
	const isShowing = computed(() => item.open === true);

	// Closed hides the group, never detaches it: every node in here is a widget root, and one inside a runtime-flipping arm is MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED.
	<div
		{...rest}
		el={tree.groupEls}
		role="group"
		hidden={isShowing !== true}
		ui-open={isShowing}
		ui-closed={isShowing !== true}
	>{children}</div>
}

export function TreeItemLabel({ children, ...rest }: TreeItemLabelProps) @{
	const tree = treeState();
	const item = treeItemState();

	<span {...rest} el={[item.labelEl, tree.labelEls]}>{children}</span>
}

export function TreeItemIndicator({ children, ...rest }: TreeItemIndicatorProps) @{
	const item = treeItemState();

	<span
		{...rest}
		ui-open={item.open}
		ui-closed={item.open !== true}
	>{children}</span>
}
