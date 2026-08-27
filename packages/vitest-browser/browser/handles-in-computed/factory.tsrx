import { computed, element, shared, state } from '@markless/core';
import { countOf } from './report.ts';

// The same plural read, moved into the shared factory beside the handle it
// reads, where the factory local IS the handle rather than a member off an
// instance.
export const factory = shared(
	() => {
		const s = state({ tick: 0, probed: '' });
		const itemEls = element<HTMLDivElement[]>();
		const shownCount = computed(() => `${s.tick}|${countOf(itemEls)}`);

		return { ...s, itemEls, shownCount };
	},
	{ scope: 'widget' },
);

export function FactoryRoot({ children }) @{
	const s = factory();

	<div data-hic-factory-root data-derived={s.shownCount} data-probed={s.probed}>
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

export function FactoryItem({ value }) @{
	const s = factory();

	<div data-hic-item data-hic-value={value} el={s.itemEls}>{value}</div>
}
