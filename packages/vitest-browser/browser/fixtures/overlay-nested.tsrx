import { element, shared, state } from '@markless/core';
import { closeOverlay, openOverlay } from '@markless/web/fns/overlay';

// Two families in one module so the page can put the inner surface inside the
// outer one. This is the shape a real family takes: the element() handles live
// on the shared instance and the methods hand them to the primitive.
//
// Handle names are unique per module, not per shared definition, so the inner
// family cannot reuse the outer family's names.
//
// The page that arranges these lives in ./overlay-nested-page.tsrx. It has to be
// a separate module: a default-export page declared alongside the components it
// composes renders only the first component and drops the rest of the tree.
export const outer = shared(
	() => {
		const s = state({ open: false });
		const outerContentEl = element<HTMLDivElement>();
		const outerTriggerEl = element<HTMLButtonElement>();

		return {
			...s,
			outerContentEl,
			outerTriggerEl,
			show() {
				s.open = true;
				openOverlay(outerContentEl, {
					kind: 'modal',
					trigger: outerTriggerEl,
					onDismiss: () => {
						s.open = false;
					},
				});
			},
			hide() {
				s.open = false;
				closeOverlay(outerContentEl);
			},
		};
	},
	{ scope: 'widget' },
);

export const inner = shared(
	() => {
		const s = state({ open: false });
		const innerContentEl = element<HTMLDivElement>();
		const innerTriggerEl = element<HTMLButtonElement>();

		return {
			...s,
			innerContentEl,
			innerTriggerEl,
			show() {
				s.open = true;
				openOverlay(innerContentEl, {
					kind: 'modal',
					trigger: innerTriggerEl,
					onDismiss: () => {
						s.open = false;
					},
				});
			},
			hide() {
				s.open = false;
				closeOverlay(innerContentEl);
			},
		};
	},
	{ scope: 'widget' },
);

export function OuterRoot({ children }) @{
	const a = outer();

	<div data-outer-root ui-open={a.open}>{children}</div>
}

export function OuterTrigger() @{
	const a = outer();

	<button type="button" data-outer-trigger el={a.outerTriggerEl} onClick={() => a.show()}>Open A</button>
}

export function OuterContent({ children }) @{
	const a = outer();

	<div
		data-outer-content
		el={a.outerContentEl}
		role="dialog"
		hidden={a.open !== true}
		ui-open={a.open}
	>
		<button type="button" data-outer-close onClick={() => a.hide()}>Close A</button>
		{children}
	</div>
}

export function InnerRoot({ children }) @{
	const b = inner();

	<div data-inner-root ui-open={b.open}>{children}</div>
}

export function InnerTrigger() @{
	const b = inner();

	<button type="button" data-inner-trigger el={b.innerTriggerEl} onClick={() => b.show()}>Open B</button>
}

export function InnerContent() @{
	const b = inner();

	<div
		data-inner-content
		el={b.innerContentEl}
		role="dialog"
		hidden={b.open !== true}
		ui-open={b.open}
	>
		<button type="button" data-inner-close onClick={() => b.hide()}>Close B</button>
	</div>
}
