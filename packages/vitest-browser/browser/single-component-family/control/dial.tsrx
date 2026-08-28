import { element, shared, state } from '@markless/core';
import { rosterOf, soleOf } from '../report.ts';

// The same-module control: the family of `family/dial.tsrx` again, beside one
// trivial extra component. Two components in the module is the only difference,
// so a row green here and red there names the module's component count and
// nothing else.
export const controlDial = shared(
	() => {
		const d = state({ tag: '', roster: '', sole: '' });
		const markEls = element<HTMLButtonElement[]>();
		const headEl = element<HTMLElement>();

		return { ...d, markEls, headEl };
	},
	{ scope: 'widget' },
);

export function ControlDial({ tag, children }) @{
	const d = controlDial();
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

export function ControlNote() @{
	<span data-note>note</span>
}
