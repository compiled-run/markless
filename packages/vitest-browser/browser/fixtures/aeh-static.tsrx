import { element, shared, state } from '@markless/core';
import { reportCount, reportValues } from './aeh-report.ts';

// The array TYPE ARGUMENT is the whole declaration of plurality: `optionEls`
// takes many elements because it was written `element<HTMLDivElement[]>()`, and
// `contentEl` beside it still takes exactly one because it was not.
export const aeh = shared(
	() => {
		const s = state({ order: '', count: '' });
		const contentEl = element<HTMLDivElement>();
		const optionEls = element<HTMLDivElement[]>();

		return { ...s, contentEl, optionEls };
	},
	{ scope: 'widget' },
);

export function AehRoot({ children }) @{
	const s = aeh();

	<div data-aeh-root data-order={s.order} data-count={s.count}>{children}</div>
}

export function AehContent({ children }) @{
	const s = aeh();

	<div data-aeh-content el={s.contentEl}>{children}</div>
}

export function AehOption({ value }) @{
	const s = aeh();

	<div data-aeh-option data-aeh-value={value} el={s.optionEls}>{value}</div>
}

export function AehProbe() @{
	const s = aeh();

	<button type="button" data-aeh-probe onClick={() => {
		s.order = reportValues(s.optionEls);
		s.count = reportCount(s.optionEls);
	}}>probe</button>
}
