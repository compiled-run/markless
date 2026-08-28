import { element, shared, state } from '@markless/core';
import { rosterOf, soleOf } from '../report.ts';

// A widget family whose module declares EXACTLY ONE component. The family
// carries a plural element() handle its parts bind and a singular one the root
// binds on its own head; the root reads both in a handler.
export const dial = shared(
	() => {
		const d = state({ tag: '', roster: '', sole: '' });
		const markEls = element<HTMLButtonElement[]>();
		const headEl = element<HTMLElement>();

		return { ...d, markEls, headEl };
	},
	{ scope: 'widget' },
);

export function Dial({ tag, children }) @{
	const d = dial();
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
		{children}
	</div>
}
