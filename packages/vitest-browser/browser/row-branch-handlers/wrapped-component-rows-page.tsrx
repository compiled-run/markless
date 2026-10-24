import { state } from '@markless/core';

type Item = { readonly id: string; readonly open: boolean };

function Toggle({ item, onFlip }: { readonly item: Item; readonly onFlip: (id: string) => void }) @{
	<span>
		@if (item.open) {
			<button type="button" data-close={item.id} onClick={() => onFlip(item.id)}>close</button>
		} @else {
			<button type="button" data-open={item.id} onClick={() => onFlip(item.id)}>open</button>
		}
	</span>
}

export default function WrappedComponentRowsPage() @{
	let flipped = state('none');
	let items = state<readonly Item[]>([
		{ id: 'a', open: false },
		{ id: 'b', open: false },
		{ id: 'c', open: false },
	]);
	<main>
		<output data-flipped>{flipped}</output>
		<ul>
			@for (const item of items; key item.id) {
				<li data-item={item.id}>
					<b>{item.id}</b>
					<Toggle
						item={item}
						onFlip={(id) => {
							flipped = id;
							items = items.map((each) => (each.id === id ? { ...each, open: !each.open } : each));
						}}
					/>
				</li>
			}
		</ul>
	</main>
}
