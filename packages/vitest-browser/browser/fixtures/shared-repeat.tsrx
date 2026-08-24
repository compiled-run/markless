import { shared, state } from '@markless/core';

// Defect 86. The canonical headless-family shape: a spread-object factory, and a
// component that keeps its instance in a local. The @for reads the collection
// through that local, which exists only inside the component function.
export const listBox = shared(
	() => {
		const box = state({
			items: [
				{ id: 'a', label: 'Alpha' },
				{ id: 'b', label: 'Beta' },
				{ id: 'c', label: 'Gamma' },
			],
		});

		return {
			...box,
			dropFirst() {
				box.items = box.items.slice(1);
			},
			restore() {
				box.items = [
					{ id: 'a', label: 'Alpha' },
					{ id: 'b', label: 'Beta' },
					{ id: 'c', label: 'Gamma' },
				];
			},
		};
	},
	{ scope: 'widget' },
);

export default function SharedRepeatPage() @{
	const box = listBox();

	<section data-shared-repeat data-shared-repeat-count={box.items.length}>
		<button type="button" data-shared-repeat-drop onClick={() => box.dropFirst()}>drop</button>
		<button type="button" data-shared-repeat-restore onClick={() => box.restore()}>restore</button>
		<ul data-shared-repeat-list>
			@for (const item of box.items; key item.id) {
				<li data-shared-repeat-row>{item.label}</li>
			}
		</ul>
	</section>
}
