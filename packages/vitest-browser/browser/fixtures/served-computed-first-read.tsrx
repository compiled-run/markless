import { computed, shared, state } from '@markless/core';

/**
 * The slider-NaN shape: a thumb keydown reads a factory `computed()` BEFORE any
 * dependency has been written. A resume re-derives a sync computed only when a
 * dependency moves, so that first read used to answer undefined and the
 * arithmetic over it reported NaN.
 */
export const track = shared(
	() => {
		const s = state({ value: 20, min: 0, max: 100, reading: -1 });
		const percent = computed(() => ((s.value - s.min) / (s.max - s.min)) * 100);

		return { ...s, percent };
	},
	{ scope: 'widget' },
);

export function Thumb() @{
	const t = track();

	<div data-thumb tabindex="0" onKeyDown={() => { t.reading = t.percent + 5; }}>
		<span data-percent>{t.percent}</span>
		<span data-reading>{t.reading}</span>
	</div>
}
