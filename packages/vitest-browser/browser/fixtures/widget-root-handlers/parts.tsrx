import { computed, shared, state } from '@markless/core';

// Outer family: rooted by `Outer`, read by parts placed in its children.
export const outerState = shared(
	() => {
		const s = state({ clicks: 0, keys: 0 });

		return {
			...s,
			bump() {
				s.clicks = s.clicks + 1;
			},
			key() {
				s.keys = s.keys + 1;
			},
		};
	},
	{ scope: 'widget' },
);

// Inner family: rooted by `Inner`, which is written INSIDE an `Outer`. Its root
// element is therefore a widget-rooting element nested in another widget.
export const innerState = shared(
	() => {
		const s = state({ hits: 0, taps: 0 });

		return {
			...s,
			hit() {
				s.hits = s.hits + 1;
			},
			tap() {
				s.taps = s.taps + 1;
			},
		};
	},
	{ scope: 'widget' },
);

// Defect 57 shape: a widget-root element carrying TWO handlers. The click was
// there first; the keydown is the second handler that was measured inert.
export function Outer({ children }) @{
	const s = outerState();

	<div
		data-wrh-outer
		tabindex={0}
		onClick={() => s.bump()}
		onKeydown={() => s.key()}
	>{children}</div>
}

export function OuterDisplay() @{
	const s = outerState();

	<p data-wrh-outer-display>
		<span data-wrh-outer-clicks>{s.clicks}</span>
		<span data-wrh-outer-keys>{s.keys}</span>
	</p>
}

// Defect 58 shape: a NESTED widget-rooting element carrying a handler. `Inner`
// roots its own family while sitting inside `Outer`'s instance. It carries every
// feature the measured `tree.item` / `select.item` did: a rest spread, computed
// cells read in attribute position, a read of the ENCLOSING family's instance,
// and a pass-through callback prop beside the framework's own handler.
// Defect 57 + 58 shape together, exactly as `select.item` / `tree.item` are
// written: a NESTED widget-rooting element that already carried `onClick` and
// then gained `onKeydown` beside it. It carries every feature those parts had -
// a rest spread, computed cells read in attribute position, a read of the
// ENCLOSING family's instance, and a pass-through callback prop.
export function Inner({ children, onClick, onKeydown, ...rest }) @{
	const outer = outerState();
	const s = innerState();
	const isHot = computed(() => s.hits > 0);
	const isCold = computed(() => s.hits === 0);

	<div
		{...rest}
		data-wrh-inner
		role="treeitem"
		tabindex={0}
		ui-hot={isHot}
		ui-cold={isCold}
		onClick={(event) => {
			s.tap();
			onClick?.(event);
		}}
		onKeydown={(event) => {
			if (outer.clicks >= 0) s.hit();
			onKeydown?.(event);
		}}
	>{children}</div>
}

// The part a nested item's children are written into, so a second `Inner` is
// projected through it exactly as `tree.item` sits inside `tree.itemcontent`
// inside another `tree.item`.
export function InnerContent({ children, ...rest }) @{
	const s = innerState();
	const isOpen = computed(() => s.hits >= 0);

	<div {...rest} data-wrh-inner-content ui-open={isOpen}>{children}</div>
}

// A plain label part, so each item level carries a child that is not a widget
// root and does not answer for any event of its own.
export function InnerLabel({ children, ...rest }) @{
	<span {...rest} data-wrh-inner-label>{children}</span>
}

export function InnerDisplay() @{
	const s = innerState();

	<p data-wrh-inner-display>
		<span data-wrh-inner-hits>{s.hits}</span>
		<span data-wrh-inner-taps>{s.taps}</span>
	</p>
}
