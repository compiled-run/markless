import { computed, element, shared, state } from '@markless/core';
import { countOf } from './report.ts';

// One plural element() handle read TWICE: once from a computed() declared in the
// root part, once from a handler on the same part. The computed also reads a
// state cell, so a bump proves the derivation ran without proving the handle
// answered.
export const plural = shared(
	() => {
		const s = state({ tick: 0, probed: '' });
		const itemEls = element<HTMLDivElement[]>();

		return { ...s, itemEls };
	},
	{ scope: 'widget' },
);

export function PluralRoot({ children }) @{
	const s = plural();
	const derived = computed(() => `${s.tick}|${countOf(s.itemEls)}`);

	<div data-hic-plural-root data-derived={derived} data-probed={s.probed}>
		{children}
		<button type="button" data-hic-bump onClick={() => (s.tick = s.tick + 1)}>bump</button>
		<button
			type="button"
			data-hic-probe
			onClick={() => {
				const items = s.itemEls;
				s.probed = `${s.tick}|${countOf(items)}`;
			}}
		>probe</button>
	</div>
}

export function PluralItem({ value }) @{
	const s = plural();

	<div data-hic-item data-hic-value={value} el={s.itemEls}>{value}</div>
}
