import { shared, state } from '@markless/core';

// No scope: one instance for the whole app, as toaster's queue is.
export const countState = shared(() => {
	const count = state({ taps: 0 });
	return {
		...count,
		bump() {
			count.taps = count.taps + 1;
		},
	};
});

export function Bumper() @{
	const count = countState();
	<button onClick={() => count.bump()}>Bump</button>
}

export function Readout({ label }: { label: string }) @{
	const count = countState();
	<p>{`${label} ${count.taps}`}</p>
}
