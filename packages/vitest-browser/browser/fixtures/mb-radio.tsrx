import { element, shared, state } from '@markless/core';
import { appendOrder, reportOne, reportValues } from './mb-report.ts';

// The radio-group shape the multi-binding ruling was written for: ONE `<input>`
// carries a handle from the ITEM instance and a member of a set held by the
// GROUP instance. Neither is expressible without `el={[a, b]}`, and the pair is
// only legal because a handle read names its widget from where the HANDLE was
// declared rather than from what else registered on the reading host.

export const mbGroup = shared(
	() => {
		const s = state({ order: '', picked: '' });
		// Heterogeneous on purpose: the set spans an <input> here and, on the
		// nav page, a <nav>, a <button> and an <a>.
		const fieldEls = element<HTMLElement[]>();

		return { ...s, fieldEls };
	},
	{ scope: 'widget' },
);

export const mbItem = shared(
	() => {
		const s = state({ hit: '' });
		// Singular, so it stays IDREF-capable: the label's `for=` resolves to it.
		const fieldEl = element<HTMLInputElement>();

		return { ...s, fieldEl };
	},
	{ scope: 'widget' },
);

export function MbGroup({ children }) @{
	const group = mbGroup();

	<div data-mb-group data-order={group.order} data-picked={group.picked}>{children}</div>
}

export function MbItem({ children }) @{
	const item = mbItem();

	<div data-mb-item data-hit={item.hit}>{children}</div>
}

export function MbField({ value }) @{
	const group = mbGroup();
	const item = mbItem();

	<input
		type="radio"
		data-mb-field
		data-mb-value={value}
		name="mb"
		el={[item.fieldEl, group.fieldEls]}
	/>
}

// Reads the ITEM handle from an element that also carries a group-instance
// registration. The answer must be this item's own input, never a sibling's.
export function MbLabel({ children }) @{
	const item = mbItem();

	<label data-mb-label for={item.fieldEl} onClick={() => {
		item.hit = reportOne(item.fieldEl);
	}}>{children}</label>
}

// Reads the GROUP handle from a part that binds nothing at all.
export function MbWalk() @{
	const group = mbGroup();

	<button type="button" data-mb-walk onClick={() => {
		group.order = reportValues(group.fieldEls);
	}}>walk</button>
}

// Both handles read from ONE handler, each answering its own declaring instance.
export function MbProbe() @{
	const group = mbGroup();
	const item = mbItem();

	<button type="button" data-mb-probe onClick={() => {
		group.picked = reportOne(item.fieldEl);
		appendOrder(item.fieldEl, reportValues(group.fieldEls));
	}}>probe</button>
}
