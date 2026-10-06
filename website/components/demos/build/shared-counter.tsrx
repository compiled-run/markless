import { shared, state } from '@markless/core';

export const counter = shared(
	() => {
		const box = state({ count: 0 });
		return { ...box, increment() { box.count++; } };
	},
	{ scope: 'page' },
);

function Badge() @{
	const c = counter();

	<output>{c.count}</output>
}

export default function SharedCounter() @{
	const c = counter();

	<section>
		<p>Badge shows: <Badge /></p>
		<button onClick={() => c.increment()}>Add one</button>
	</section>
}
