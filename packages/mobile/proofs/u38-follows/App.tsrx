import { shared, state } from '@markless/core';

const boxState = shared(
	() => {
		const box = state({ on: false });
		return {
			...box,
			toggle() {
				box.on = box.on !== true;
			},
		};
	},
	{ scope: 'subtree' },
);

function Box({ on = false, children }: { readonly on?: boolean; readonly children?: unknown }) @{
	const box = boxState();
	box.on = on;
	<div ui-on={box.on}>{children}</div>
}

function Toggle() @{
	const box = boxState();
	<button onClick={() => box.toggle()}>{box.on ? 'Box on' : 'Box off'}</button>
}

export default function App() @{
	let count = state(0);
	<main>
		<h1>Follows</h1>
		<p>{`Count ${count}`}</p>
		<button onClick={() => (count = count + 1)}>Add</button>
		<Box on={count >= 2}>
			<Toggle />
		</Box>
	</main>
}
