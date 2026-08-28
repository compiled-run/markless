import { computed, element, shared, state } from '@markless/core';
import { rosterOf } from '../report.ts';

// The same family, one difference: the keyed row is a COMPONENT of this module
// that binds the handle on its own root, which is the calendar's working shape.
export const rowDial = shared(
	() => {
		const d = state({ tag: '', roster: '' });
		const markEls = element<HTMLLIElement[]>();

		const rows = computed(() => [`${d.tag}1`, `${d.tag}2`]);

		return { ...d, markEls, rows };
	},
	{ scope: 'widget' },
);

export function RowMark({ value }) @{
	const d = rowDial();
	const row = state({ value });

	<li data-mark data-name={row.value} el={d.markEls}>{row.value}</li>
}

export function RowDial({ tag }) @{
	const d = rowDial();
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
				<RowMark value={row} />
			}
		</ul>
	</div>
}
