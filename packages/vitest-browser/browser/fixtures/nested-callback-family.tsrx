import { shared, state } from '@markless/core';

// U152 / defect 20. A family-like module whose part takes an OPTIONAL event
// prop out of a rest spread and calls it guarded: `onKeyDown?.(event)`. The
// signature is the shape every headless family writes — name the props the part
// reads, forward the remainder to the host element — and it is what a capture
// route has to survive: the part's own module composes no edge for `onKeydown`,
// so the prop read has no component edge to answer it and the capture falls back
// to the `prop:props` placeholder node, which the resume dispatcher then asks
// the graph to read.
export const nkf = shared(
	() => {
		const s = state({ label: '', keys: 0 });

		return {
			...s,
			record() {
				s.keys = s.keys + 1;
			},
		};
	},
	{ scope: 'widget' },
);

export function NkfRoot({ label = '', children }) @{
	const s = nkf();
	s.label = label;

	<div data-nkf-root data-label={s.label}>{children}</div>
}

// The event prop is optional and guarded; `rest` carries whatever else the
// consumer put on the part through to the host button. The name is spelled
// `onKeyDown` because MARKLESS_EVENT_SPREAD_SHADOWED refuses a part that spreads
// `rest` over an element whose own handler the spread could carry: the prop the
// part names has to be the one it takes out of the spread.
export function NkfItem({ onKeyDown, ...rest }) @{
	const s = nkf();

	<button
		type="button"
		{...rest}
		data-nkf-item
		onKeyDown={(event) => {
			s.record();
			onKeyDown?.(event);
		}}
	>{s.keys}</button>
}
