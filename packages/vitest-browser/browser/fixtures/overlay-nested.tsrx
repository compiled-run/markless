import { shared, state } from '@markless/core';

// Two families in one module so the page can put the inner surface inside the
// outer one. This is the shape a real family takes on the attribute surface:
// shared state decides shown-ness, `overlay` marks the surface, and `onDismiss`
// is where the family writes its own policy. No handles, no imports.
//
// The page that arranges these lives in ./overlay-nested-page.tsrx. It has to be
// a separate module: a default-export page declared alongside the components it
// composes renders only the first component and drops the rest of the tree.
export const outer = shared(
	() => {
		const s = state({ isOpen: false });

		return {
			...s,
			show() {
				s.isOpen = true;
			},
			hide() {
				s.isOpen = false;
			},
		};
	},
	{ scope: 'widget' },
);

export const inner = shared(
	() => {
		const s = state({ isOpen: false });

		return {
			...s,
			show() {
				s.isOpen = true;
			},
			hide() {
				s.isOpen = false;
			},
		};
	},
	{ scope: 'widget' },
);

export function OuterRoot({ children }) @{
	const a = outer();

	<div data-outer-root ui-open={a.isOpen}>{children}</div>
}

export function OuterTrigger() @{
	const a = outer();

	<button type="button" data-outer-trigger onClick={() => a.show()}>Open A</button>
}

export function OuterContent({ children }) @{
	const a = outer();

	<div
		data-outer-content
		overlay
		role="dialog"
		aria-modal="true"
		hidden={a.isOpen !== true}
		ui-open={a.isOpen}
		onDismiss={() => a.hide()}
	>
		<button type="button" data-outer-close onClick={() => a.hide()}>Close A</button>
		{children}
	</div>
}

export function InnerRoot({ children }) @{
	const b = inner();

	<div data-inner-root ui-open={b.isOpen}>{children}</div>
}

export function InnerTrigger() @{
	const b = inner();

	<button type="button" data-inner-trigger onClick={() => b.show()}>Open B</button>
}

export function InnerContent() @{
	const b = inner();

	<div
		data-inner-content
		overlay
		role="dialog"
		aria-modal="true"
		hidden={b.isOpen !== true}
		ui-open={b.isOpen}
		onDismiss={() => b.hide()}
	>
		<button type="button" data-inner-close onClick={() => b.hide()}>Close B</button>
	</div>
}
