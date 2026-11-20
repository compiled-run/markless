import { shared, state } from '@markless/core';

const tagState = shared(
	() => {
		const tag = state({ label: '', taps: 0 });
		return {
			...tag,
			tap() {
				tag.taps = tag.taps + 1;
			},
		};
	},
	{ scope: 'subtree' },
);

function Tag({ label }: { readonly label: string }) @{
	const tag = tagState();
	tag.label = label;
	<button onClick={() => tag.tap()}>{`${tag.label} tapped ${tag.taps}`}</button>
}

export default function App() @{
	let items = state([{ id: 'a', name: 'Apple', size: 1 }]);
	<main>
		<h1>Fruit</h1>
		@for (const item of items; key item.id) {
			<div>
				<Tag label={item.name} />
				<span>{`Size ${item.size}`}</span>
			</div>
		}
		<button onClick={() => (items = items.map((one) => ({ id: one.id, name: one.name === 'Apple' ? 'Apricot' : 'Apple', size: one.size })))}>Rename</button>
		<button onClick={() => (items = items.map((one) => ({ id: one.id, name: one.name, size: one.size + 1 })))}>Grow</button>
	</main>
}
