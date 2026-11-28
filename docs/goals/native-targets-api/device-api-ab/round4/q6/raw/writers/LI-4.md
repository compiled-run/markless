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
	let address = state(addresses[0].label);
	let addressOpen = state(false);

	<main>
		<drawer.root>
			<drawer.trigger class="button">Filters</drawer.trigger>
			<drawer.backdrop class="sheet-backdrop">
				<drawer.content class="sheet">
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
					<drawer.close class="button">Apply</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>

		<modal.root alert>
			<modal.trigger class="button danger">Delete</modal.trigger>
			<modal.backdrop class="dialog-backdrop">
				<modal.content class="dialog">
					<modal.title>Delete this order?</modal.title>
					<modal.close class="button danger" onClick={() => (deleted = true)}>Delete</modal.close>
					<modal.close class="button">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
		@if (deleted) {
			<p>Order deleted.</p>
		}

		<p>
			Deliver to: <span>{address}</span>
		</p>
		<drawer.root open={addressOpen} onChange={(open) => (addressOpen = open)}>
			<drawer.trigger class="button">Change</drawer.trigger>
			<drawer.backdrop class="sheet-backdrop">
				<drawer.content class="sheet">
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
2. Delete: centered box
3. Deliver to / Change: bottom sheet

## Website
1. Filters: bottom sheet, a panel sliding up from the bottom of the browser window
2. Delete: centered box
3. Deliver to / Change: bottom sheet, a panel sliding up from the bottom of the browser window

## Guesses
- I assumed `drawer.trigger`, `drawer.close`, `modal.trigger` and `modal.close` render as buttons, and that their children become the button label.
- I assumed `drawer.close` and `modal.close` still close the panel when I also pass an `onClick`, and that `onClick` runs before it closes.
- I assumed that when `drawer.root` gets `open` and `onChange`, its trigger calls `onChange(true)` instead of opening the panel itself, and that setting `addressOpen = false` closes it.
- I assumed `checked` and `onChange` on a native checkbox work as they do in the browser, and that `onChange` gets a native event.
- I assumed one `.tsrx` file can hold a module-level constant outside the component, and that a handler can run two assignments in one block body.
- I assumed `@if` can sit as a sibling inside `<main>` without a wrapper.
- I assumed the drawer looks the same on a laptop as on a phone (a bottom sheet), because the sheet says it does that "on every platform". A centered `modal` would arguably suit the website better, but you can't switch per platform with only what the sheet provides.
- The signature sheet doesn't say what happens after Delete is confirmed, so I just show "Order deleted."

Tools used: none
