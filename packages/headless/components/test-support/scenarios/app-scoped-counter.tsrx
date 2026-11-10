import { shared, state } from '@markless/core';

// App scope is the opposite of the accordion's subtree scope: ONE cell for the
// whole page no matter how many islands read it. Two islands of this module are
// what proves island discrimination left app-scoped sharing alone.
export const pageCounter = shared(
	() => {
		const data = state({ count: 0 });
		return {
			...data,
			bump() {
				data.count += 1;
			},
		};
	},
	{ scope: 'app' },
);

export default function PageScopedCounter() @{
	const counter = pageCounter();

	<div data-testid="counter-frame">
		<output data-testid="counter-value">{counter.count}</output>
		<button type="button" data-testid="counter-bump" onClick={() => counter.bump()}>
			Bump
		</button>
	</div>
}
