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
	let vegan = state(false);
	let glutenFree = state(false);
	let underTen = state(false);
	let deleted = state(false);
	let addressOpen = state(false);
	let address = state(addresses[0].label);

	<main>
		<drawer.root>
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

		<modal.root alert>
			<modal.trigger>Delete</modal.trigger>
			<modal.backdrop>
				<modal.content>
					<modal.title>Delete this order?</modal.title>
					<modal.close onClick={() => (deleted = true)}>Delete</modal.close>
					<modal.close>Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
		@if (deleted) {
			<p>Order deleted.</p>
		}

		<p>
			Deliver to: {address}
		</p>
		<modal.root adaptive open={addressOpen} onChange={(open) => (addressOpen = open)}>
			<modal.trigger>Change</modal.trigger>
			<modal.backdrop>
				<modal.content>
					<modal.title>Saved addresses</modal.title>
					<ul>
						@for (const item of addresses; key item.id) {
							<li>
								<button
									onClick={() => {
										address = item.label;
										addressOpen = false;
									}}
								>
									{item.label}
								</button>
							</li>
						}
					</ul>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</main>
}
```

Confidence: 3/5

## Phone
1. Bottom sheet
2. Centered box
3. Bottom sheet

## Website
1. Bottom sheet
2. Centered box
3. Centered box

## Guesses
- The sheet lets you put `adaptive` on `<modal.root>`, but `adaptive` is not in the `modal.root` props type. I assumed it type-checks anyway.
- I assumed `drawer.close` and `modal.close` still close the panel when they also have an `onClick` (the Delete button records the deletion and closes).
- I assumed a `<main>` can hold several family roots and sibling elements side by side, and that an `@if` placed among siblings is allowed.
- I assumed a block-bodied arrow handler that assigns two pieces of state is fine (the address choice sets the address and closes the list).
- I used a drawer for Filters, so it is a bottom sheet on the website too. If a side panel was wanted on desktop, `orientation`/`start` would be needed, and nothing documents how to do that for one platform only.
- I assumed a module-level constant array can be looped over with `@for`.
- I assumed checkbox `onChange` gives a native event whose `currentTarget.checked` I can read.

Tools used: Read (to open the task file only)
