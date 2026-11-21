import { shared, state } from '@markless/core';

// No scope: the whole app holds one tally, across its pages.
export const tallyState = shared(() => {
	const tally = state({ taps: 0 });
	return {
		...tally,
		bump() {
			tally.taps = tally.taps + 1;
		},
	};
});

export function Tally({ label }: { label: string }) @{
	const tally = tallyState();
	<p>{`${label} ${tally.taps}`}</p>
}

export function Bump({ label }: { label: string }) @{
	const tally = tallyState();
	<button onClick={() => tally.bump()}>{label}</button>
}
