import { element, shared, state } from '@markless/core';
import { rosterOf } from '../report.ts';

export const v2Dial = shared(
	() => {
		const d = state({ roster: '' });
		const markEls = element<HTMLButtonElement[]>();

		return { ...d, markEls };
	},
	{ scope: 'widget' },
);

export function V2Dial({ children }) @{
	const d = v2Dial();

	<div data-dial data-roster={d.roster}>
		<button
			type="button"
			data-probe
			onClick={() => {
				d.roster = rosterOf(d.markEls);
			}}
		>probe</button>
		{children}
	</div>
}

export function V2Mark({ name }) @{
	const d = v2Dial();

	<button type="button" data-mark data-name={name} el={d.markEls}>{name}</button>
}
