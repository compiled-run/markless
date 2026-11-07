import { state } from '@markless/core';

const stepBy = (step: number) => (value: number) => value + step;

export function Tally() @{
	let total = state(0);
	const makeAdd = (step: number) => () => {
		total = stepBy(step)(total);
	};
	const add = makeAdd(3);
	<main>
		<button type="button" data-add onClick={() => add()}>Add</button>
		<p data-total>{total}</p>
	</main>
}
