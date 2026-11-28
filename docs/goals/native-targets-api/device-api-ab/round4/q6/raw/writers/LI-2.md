```tsrx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

const addresses = [
	{ id: 1, label: 'Home, 12 Elm Street' },
	{ id: 2, label: 'Work, 400 Market Street' },
	{ id: 3, label: 'Parents, 9 Oak Lane' },
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
		<drawer.root open={addressOpen} onChange={(open) => (addressOpen = open)}>
			<drawer.trigger>Change</drawer.trigger>
			<drawer.backdrop>
				<drawer.content>
					<drawer.title>Saved addresses</drawer.title>
					<ul>
						@for (const option of addresses; key option.id) {
							<li>
								<button
									onClick={() => {
										address = option.label;
										addressOpen = false;
									}}
								>
									{option.label}
								</button>
							</li>
						}
					</ul>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</main>
}
```

Confidence: 3/5

## Phone
1. Filters: bottom sheet
2. Delete confirmation: centered box
3. Address list: bottom sheet

## Website
1. Filters: bottom sheet. The sheet says the drawer slides in from the bottom on every platform, laptops included.
2. Delete confirmation: centered box
3. Address list: bottom sheet

## Guesses
- I assumed families are used as JSX tags with dot names (`<drawer.root>`), imported as `{ drawer, modal }` from `@markless/ui`.
- I assumed `drawer.trigger`, `drawer.close` and `modal.close` toggle the open state themselves and report it through `onChange`. I also assumed a `modal.close` with its own `onClick` still closes the dialog.
- I assumed the bare `alert` attribute works as a boolean prop, and that the alert dialog does not need a `modal.description`.
- I assumed that setting the controlled `open` state to `false` from a button closes the address drawer.
- I assumed native checkbox `onChange` with `event.currentTarget.checked` works as it does in the browser.
- The prompt didn't say what Delete should do, so it just sets a flag and shows "Order deleted."
- I left styling out, since every part is unstyled.

Tools used: none
