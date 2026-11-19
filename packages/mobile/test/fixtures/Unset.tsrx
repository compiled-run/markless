import { shared, state } from '@markless/core';

const pickState = shared(
	() => {
		const pick = state({ chosen: undefined as string | undefined, count: 0 });
		return {
			...pick,
			choose(next: string) {
				pick.chosen = next;
				pick.count = pick.count + 1;
			},
			clear() {
				pick.chosen = undefined;
			},
		};
	},
	{ scope: 'subtree' },
);

function Picker() @{
	const pick = pickState();
	<div>
		<p>{pick.chosen ?? 'nothing'}</p>
		<p>{pick.chosen === undefined ? 'unset' : 'set'}</p>
		<p>{`Picked ${pick.count}`}</p>
		<button onClick={() => pick.choose('tea')}>Tea</button>
		<button onClick={() => pick.clear()}>Clear</button>
	</div>
}

export default function Unset() @{
	let note = state({ text: undefined as string | undefined });
	<main>
		<Picker />
		<p>{note.text ?? 'no note'}</p>
		<button onClick={() => (note.text = note.text === undefined ? 'hello' : undefined)}>Note</button>
	</main>
}
