```tsx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

const addresses = [
	{ id: 1, label: 'Home, 12 Elm Street' },
	{ id: 2, label: 'Work, 400 Market Street' },
	{ id: 3, label: 'Mum, 7 Harbour Road' },
];

export default function Checkout() @{
	let vegan = state(false);
	let glutenFree = state(false);
	let underTen = state(false);

	let deleteOpen = state(false);
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

		<modal.root alert open={deleteOpen} onChange={(open) => (deleteOpen = open)}>
			<modal.trigger>Delete</modal.trigger>
			<modal.backdrop>
				<modal.content>
					<modal.title>Delete this order?</modal.title>
					<button
						onClick={() => {
							deleted = true;
							deleteOpen = false;
						}}
					>
						Delete
					</button>
					<modal.close>Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
		@if (deleted) {
			<p>Order deleted.</p>
		}

		<modal.root presentation="adaptive" open={addressOpen} onChange={(open) => (addressOpen = open)}>
			<p>
				Deliver to: {address}
				<modal.trigger>Change</modal.trigger>
			</p>
			<modal.backdrop>
				<modal.content>
					<modal.title>Saved addresses</modal.title>
					<ul>
						@for (const saved of addresses; key saved.id) {
							<li>
								<button
									onClick={() => {
										address = saved.label;
										addressOpen = false;
									}}
								>
									{saved.label}
								</button>
							</li>
						}
					</ul>
					<modal.close>Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</main>
}
```

Confidence: 3/5

## Phone
1. Filters: a bottom sheet.
2. Delete: a centered box (an alert dialog).
3. Change address: a bottom sheet.

## Website
1. Filters: a bottom sheet. The drawer slides up from the bottom edge on every platform, the website included.
2. Delete: a centered box (an alert dialog).
3. Change address: a centered box.

## Guesses
- `presentation="adaptive"` is not in the `modal.root` type signature. Only the prose note on the sheet mentions it, so I assumed `modal.root` accepts it even though the type does not list it.
- I assumed parts take their text and child parts as nested children (the `children` prop in `Div`), and that `modal.trigger` and `drawer.close` open and close the panel without an `onClick`.
- I assumed `modal.trigger` can sit inside a `<p>` within `modal.root`, so the "Change" button shows on the "Deliver to" line.
- I assumed that setting the controlled `open` state to `false` from a handler inside the content closes the modal, and that `onChange` reports closes made by `modal.close` and the backdrop.
- I chose a drawer for Filters because the sheet calls it "a panel". An adaptive modal would instead give laptop visitors a centered box.
- I assumed native `checked` and `onChange` work on plain `<input type="checkbox">` and that `currentTarget.checked` is typed correctly.
- I put the delete result, an "Order deleted." line, outside the modal.

Tools used: none
