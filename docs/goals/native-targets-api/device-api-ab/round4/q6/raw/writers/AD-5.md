```tsrx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

export default function Checkout() @{
	let filtersOpen = state(false);
	let vegan = state(false);
	let glutenFree = state(false);
	let underTen = state(false);

	let deleteOpen = state(false);
	let deleted = state(false);

	const addresses = [
		{ id: 1, label: '12 Harbour Street, Leeds' },
		{ id: 2, label: '4 Mill Lane, York' },
		{ id: 3, label: '88 Queen Road, Hull' },
	];
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
1. Filters: bottom sheet
2. Delete: centered box (an alert dialog)
3. Change address: bottom sheet (the `adaptive` modal)

## Website
1. Filters: bottom sheet (the drawer slides up from the bottom on every platform)
2. Delete: centered box
3. Change address: centered box

## Guesses
- `adaptive` appears in the sheet's prose but not in the `modal.root` props type. I assumed it type-checks as a boolean attribute.
- I assumed `drawer.trigger`, `modal.trigger` and `drawer.close`/`modal.close` open and close a controlled root by calling `onChange`, so the `open` state stays in sync. The sheet says this for the drawer only. For the modal I inferred it from the matching anatomy.
- I assumed `modal.close` runs its `onClick` and then closes, so the Delete button can record the deletion and close the dialog in one click.
- I assumed `modal.title` gives the dialog its accessible name, so `aria-label` isn't needed.
- I assumed a native `<input type="checkbox">` with `checked` and `onChange` works as it does in HTML on all three platforms.
- I assumed setting `addressOpen = false` from a plain button inside the content closes the modal.
- The sheet doesn't say whether a parent part such as `drawer.backdrop` can wrap several children without a single root. I assumed it can.
- The addresses and the "Order deleted." line are placeholders I made up.

Tools used: none
