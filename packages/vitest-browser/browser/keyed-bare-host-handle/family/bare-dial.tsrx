import { computed, element, shared, state } from '@markless/core';
import { rosterOf } from '../report.ts';

// The family binds its plural handle on a BARE host inside a keyed @for in its
// own root, and reads the handle back in a handler of that same root.
export const bareDial = shared(
	() => {
		const d = state({ tag: '', roster: '' });
		const markEls = element<HTMLLIElement[]>();

		const rows = computed(() => [`${d.tag}1`, `${d.tag}2`]);

		return { ...d, markEls, rows };
	},
	{ scope: 'widget' },
);

export function BareDial({ tag }) @{
	const d = bareDial();
	d.tag = tag;

	<div data-dial data-roster={d.roster}>
		<button
			type="button"
			data-probe
			onClick={() => {
				d.roster = rosterOf(d.markEls);
			}}
		>probe</button>
		<ul data-marks>
			@for (const row of d.rows; key row) {
				<li data-mark data-name={row} el={d.markEls}>{row}</li>
			}
		</ul>
	</div>
}
