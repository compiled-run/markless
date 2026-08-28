import { element, shared, state } from '@markless/core';
import { rosterOf, soleOf } from '../report.ts';

// The keyed-row confound removed: the same single-component family, but the
// plural handle is bound on two STATIC hosts instead of over a keyed @for.
export const staticDial = shared(
	() => {
		const d = state({ tag: '', roster: '', sole: '' });
		const markEls = element<HTMLButtonElement[]>();
		const headEl = element<HTMLElement>();

		return { ...d, markEls, headEl };
	},
	{ scope: 'widget' },
);

export function StaticDial({ tag }) @{
	const d = staticDial();
	d.tag = tag;

	<div data-dial data-roster={d.roster} data-sole={d.sole}>
		<h3 data-head data-name={d.tag} el={d.headEl}>{d.tag}</h3>
		<button
			type="button"
			data-probe
			onClick={() => {
				d.roster = rosterOf(d.markEls);
				d.sole = soleOf(d.headEl);
			}}
		>probe</button>
		<button type="button" data-mark data-name={d.tag + '1'} el={d.markEls}>1</button>
		<button type="button" data-mark data-name={d.tag + '2'} el={d.markEls}>2</button>
	</div>
}
