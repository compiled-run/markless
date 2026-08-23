import { element, shared, state } from '@markless/core';

// Defect 72's shape: a widget-scoped family whose interactive part sits three
// projections under the root (`Root > Layer > Surface > Close`). Every part
// projects its children, so the click record's host is deeper than any part the
// family's own root can see directly.
export const deep = shared(
	() => {
		const s = state({ open: false, probe: '' });
		const closeEl = element<HTMLButtonElement>();
		return { ...s, closeEl };
	},
	{ scope: 'widget' },
);

export function Root({ children }) @{
	const d = deep();

	<div data-dpd-root data-open={d.open ? 'yes' : 'no'} data-probe={d.probe}>{children}</div>
}

export function Open({ children }) @{
	const d = deep();

	<button
		type="button"
		data-dpd-open
		onClick={() => {
			d.open = true;
		}}
	>{children}</button>
}

export function Layer({ children }) @{
	const d = deep();

	<div data-dpd-layer hidden={d.open !== true}>{children}</div>
}

export function Surface({ children }) @{
	const d = deep();

	<div data-dpd-surface data-open={d.open ? 'yes' : 'no'}>{children}</div>
}

export function Close({ children }) @{
	const d = deep();

	<button
		type="button"
		data-dpd-close
		el={d.closeEl}
		onClick={() => {
			// The very first statement: if this never lands, the record never ran.
			d.probe = 'ran';
			d.open = false;
		}}
	>{children}</button>
}
