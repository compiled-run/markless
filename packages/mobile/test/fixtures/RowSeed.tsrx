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
	<button onClick={() => tag.tap()}>{`${tag.label} ${tag.taps}`}</button>
}

export default function RowSeed() @{
	let items = state([
		{ id: 'a', name: 'Apple' },
		{ id: 'b', name: 'Berry' },
	]);
	<main>
		@for (const item of items; key item.id) {
			<Tag label={item.name} />
		}
		<button onClick={() => (items = [...items, { id: 'c', name: 'Cherry' }])}>Add</button>
		<button onClick={() => (items = items.filter((one) => one.id !== 'a'))}>Drop</button>
	</main>
}
