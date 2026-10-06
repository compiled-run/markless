import type { Children } from '@markless/core';
import { shared, state } from '@markless/core';

export const tally = shared(
	() => {
		const box = state({ count: 0 });
		return { ...box, increment() { box.count++; } };
	},
	{ scope: 'page' },
);

export function Tally({ label, children }: { label: string; children?: Children }) @{
	const t = tally();

	<p>
		{label}: {children} <button onClick={() => t.increment()}>Add one</button>
	</p>
}

export function Badge() @{
	const t = tally();

	<output>{t.count}</output>
}
