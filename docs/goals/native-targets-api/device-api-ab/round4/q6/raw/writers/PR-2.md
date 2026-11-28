```tsrx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

const addresses = [
	{ id: 1, label: 'Home, 12 Elm Street' },
	{ id: 2, label: 'Work, 400 Market Avenue' },
	{ id: 3, label: 'Mum, 7 Harbour Road' },
];

export default function Checkout() @{
	let filtersOpen = state(false);
	let vegan = state(false);
	let glutenFree = state(false);
	let underTen = state(false);

	let deleteOpen = state(false);
	let deleted = state(false);

	let addressOpen = state(false);
	let address = state(addresses[0].label);

	<main>
		<drawer.root open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
			<drawer.trigger>Filters</drawer.trigger>
			<drawer.backdrop>
				<drawer.content>
					<drawer.title>Filters</drawer.title>
					<label>
						<input type="checkbox" checked={vegan} onChange={(event) => (vegan = event.currentTarget.checked)} />
						Vegan
					</label>
					<label>
						<input type="checkbox" checked={glutenFree} onChange={(event) => (glutenFree = event.currentTarget.checked)} />
						Gluten-free
					</label>
					<label>
						<input type="checkbox" checked={underTen} onChange={(event) => (underTen = event.currentTarget.checked)} />
						Under $10
					</label>
					<drawer.close>Apply</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>

		<modal.root alert open={deleteOpen} onChange={(open) => (deleteOpen = open)}>
			<modal.trigger>Delete</modal.trigger>
			<modal.backdrop>
				<modal.content>
					<modal.title>Delete this order?</modal.title>
					<button onClick={() => { deleted = true; deleteOpen = false; }}>Delete</button>
					<modal.close>Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
		@if (deleted) {
			<p>Order deleted.</p>
		}

		<p>
			Deliver to: {address}
			<modal.root presentation="adaptive" open={addressOpen} onChange={(open) => (addressOpen = open)}>
				<modal.trigger>Change</modal.trigger>
				<modal.backdrop>
					<modal.content>
						<modal.title>Saved addresses</modal.title>
						<ul>
							@for (const saved of addresses; key saved.id) {
								<li>
									<button onClick={() => { address = saved.label; addressOpen = false; }}>{saved.label}</button>
								</li>
							}
						</ul>
					</modal.content>
				</modal.backdrop>
			</modal.root>
		</p>
	</main>
}
```

Confidence: 3/5

## Phone
1. Filters: bottom sheet
2. Delete: centered box
3. Deliver to / Change: bottom sheet

## Website
1. Filters: bottom sheet, which is a panel sliding up from the bottom edge
2. Delete: centered box
3. Deliver to / Change: centered box

## Guesses
- `presentation="adaptive"` is described in the sheet's comments but is missing from the `modal.root` props type. I assumed it is accepted anyway.
- I assumed that a `drawer.close` or `modal.close` with only children (no onClick) closes the panel and fires `onChange(false)`. This keeps the controlled `open` state in sync.
- I assumed that a plain `<button>` inside the content can close the modal by setting the controlled `open` state to false.
- I assumed `modal.trigger` renders a button that opens the modal when no `onClick` is given.
- I assumed `@if` can be used without `@else`.
- I assumed a handler body may be a block with two assignments.
- Delete has no stated result, so I show an "Order deleted." line.
- I used a drawer for Filters, so it is a bottom sheet on the website too. A modal with `presentation="adaptive"` would have kept it a centered box on laptops.

Tools used: none
