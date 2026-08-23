import { element, shared, state } from '@markless/core';

// The modal shape defect 65 was found in: one widget-scoped family whose `Root`
// seeds it, a `Content` part that READS the shared element() handle as an IDREF
// and projects its own children, and a `Title` part nested INSIDE that
// projection that BINDS the handle. Content is a part, not a root.
export const modal = shared(
	() => {
		const s = state({ open: false, labelled: false });
		const titleEl = element<HTMLHeadingElement>();
		return { ...s, titleEl };
	},
	{ scope: 'widget' },
);

export function Root({ open = false, children }) @{
	const m = modal();
	m.open = open;

	<div data-modal-root data-open={m.open}>{children}</div>
}

export function Content({ children }) @{
	const m = modal();
	m.labelled = true;

	<div role="dialog" data-modal-content aria-labelledby={m.titleEl}>{children}</div>
}

export function Title({ children }) @{
	const m = modal();

	<h2 data-modal-title el={m.titleEl}>{children}</h2>
}
