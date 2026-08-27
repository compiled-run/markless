import { computed, shared, state } from '@markless/core';

// Two widget families, the shape a tree has: an outer root whose projection
// holds an inner root, whose own projection holds the inner family's parts.
export const outer = shared(() => {
	const o = state({ locked: false });

	return { ...o };
}, { scope: 'widget' });

export const node = shared(() => {
	const n = state({ open: false });

	return {
		...n,
		toggle() {
			n.open = n.open !== true;
		},
	};
}, { scope: 'widget' });

export function OuterRoot({ locked = false, children }) @{
	const o = outer();
	o.locked = locked;

	<div data-outer-root ui-locked={o.locked}>{children}</div>
}

// A part of the OUTER family and the root of the inner one: it seeds `open`
// from its own prop, and its siblings below read that seed.
export function NodeRoot({ open = false, children }) @{
	const o = outer();
	const n = node();
	n.open = open;

	<div data-node-root ui-open={n.open} ui-locked={o.locked}>{children}</div>
}

export function NodeDirect() @{
	const n = node();

	<span data-node-direct ui-open={n.open}>d</span>
}

export function NodeComputed({ children }) @{
	const n = node();
	const showing = computed(() => n.open === true);

	<div data-node-computed hidden={showing !== true} ui-open={showing}>{children}</div>
}

export function NodeTrigger() @{
	const n = node();

	<button type="button" data-node-trigger onClick={() => n.toggle()}>t</button>
}
