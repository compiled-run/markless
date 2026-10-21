import { element, shared, state } from '@markless/core';

export const groupState = shared(
	() => {
		const group = state({ disabled: false });
		const rootEl = element<HTMLDivElement>();
		const thumbEls = element<HTMLDivElement[]>();

		return { ...group, rootEl, thumbEls };
	},
	{ scope: 'widget' },
);

// Rooted by every thumb, and nothing but an element() handle: no cell to own.
export const thumbState = shared(
	() => {
		const labelEl = element<HTMLSpanElement>();

		return { labelEl };
	},
	{ scope: 'widget' },
);

// The same, carrying a cell beside the handle.
export const cellThumbState = shared(
	() => {
		const thumb = state({ name: '' });
		const labelEl = element<HTMLSpanElement>();

		return { ...thumb, labelEl };
	},
	{ scope: 'widget' },
);

export function Group({ children }) @{
	const group = groupState();

	<div data-group el={group.rootEl}>{children}</div>
}

export function Thumb({ name, label }) @{
	const group = groupState();
	const thumb = thumbState();

	<div data-thumb={name} el={group.thumbEls} role="separator" aria-labelledby={thumb.labelEl}>
		<span el={thumb.labelEl}>{label}</span>
	</div>
}

export function CellThumb({ name, label }) @{
	const group = groupState();
	const thumb = cellThumbState();
	thumb.name = name;

	<div data-thumb={thumb.name} el={group.thumbEls} role="separator" aria-labelledby={thumb.labelEl}>
		<span el={thumb.labelEl}>{label}</span>
	</div>
}
