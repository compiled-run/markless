import { element, shared, state } from '@markless/core';
import { rosterOf } from '../report.ts';

// The keyed repeat removed: the same family binding the same plural handle on
// two STATIC bare hosts, so a red on the other two shapes is the repeat and not
// the family, the handle or the probe.
export const staticDial = shared(
	() => {
		const d = state({ tag: '', roster: '' });
		const markEls = element<HTMLLIElement[]>();

		return { ...d, markEls };
	},
	{ scope: 'widget' },
);

export function StaticDial({ tag }) @{
	const d = staticDial();
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
			<li data-mark data-name={d.tag + '1'} el={d.markEls}>1</li>
			<li data-mark data-name={d.tag + '2'} el={d.markEls}>2</li>
		</ul>
	</div>
}
