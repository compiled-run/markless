import { shared, state } from '@markless/core';

const SIZES = [1, 2];

const panel = shared(
	() => {
		const box = state({ open: false, sizes: SIZES });
		return box;
	},
	{ scope: 'subtree' },
);

function Panel({ open }: { open: boolean }) @{
	const own = panel();
	own.open = open;
	<section>
		<p>{own.open ? 'Panel open' : 'Panel closed'}</p>
		<p>{`Sizes ${own.sizes.length}`}</p>
		<button onClick={() => (own.open = !own.open)}>Panel toggles itself</button>
	</section>
}

export default function App() @{
	let shown = state(false);
	let other = state(0);
	<main>
		<h1>Seeds</h1>
		<p>{shown ? 'Page says open' : 'Page says closed'}</p>
		<button onClick={() => (shown = !shown)}>Page toggles</button>
		<button onClick={() => (other = other + 1)}>{`Unrelated ${other}`}</button>
		<Panel open={shown} />
	</main>
}
