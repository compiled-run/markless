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

	let addressOpen = state(false);
	let address = state('12 Harbour St, Leeds');

	<main>
		<drawer.root open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
			<drawer.trigger class="button">Filters</drawer.trigger>
			<drawer.backdrop class="sheet-backdrop">
				<drawer.content class="sheet">
					<drawer.title>Filters</drawer.title>
					<fieldset>
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
					</fieldset>
					<drawer.close class="button">Apply</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>

		<modal.root alert open={deleteOpen} onChange={(open) => (deleteOpen = open)}>
			<modal.trigger class="button danger">Delete</modal.trigger>
			<modal.backdrop class="dialog-backdrop">
				<modal.content class="dialog">
					<modal.title>Delete this order?</modal.title>
					<div class="actions">
						<modal.close class="button danger" onClick={() => (deleted = true)}>Delete</modal.close>
						<modal.close class="button">Cancel</modal.close>
					</div>
				</modal.content>
			</modal.backdrop>
		</modal.root>
		@if (deleted) {
			<p>Order deleted.</p>
		}

		<p>
			Deliver to: <span>{address}</span>
		</p>
		<modal.root presentation="adaptive" open={addressOpen} onChange={(open) => (addressOpen = open)}>
			<modal.trigger class="button">Change</modal.trigger>
			<modal.backdrop class="dialog-backdrop">
				<modal.content class="dialog">
					<modal.title>Saved addresses</modal.title>
					<ul>
						<li>
							<button onClick={() => { address = '12 Harbour St, Leeds'; addressOpen = false; }}>12 Harbour St, Leeds</button>
						</li>
						<li>
							<button onClick={() => { address = '4 Mill Lane, York'; addressOpen = false; }}>4 Mill Lane, York</button>
						</li>
						<li>
							<button onClick={() => { address = '88 King Rd, Hull'; addressOpen = false; }}>88 King Rd, Hull</button>
						</li>
					</ul>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</main>
}
```

Confidence: 3/5

## Phone
1. Bottom sheet (a drawer slides up from the bottom edge).
2. Centered box (an alert modal).
3. Bottom sheet (a modal set to `presentation="adaptive"`).

## Website
1. Bottom sheet (the drawer slides in from the bottom on every platform).
2. Centered box.
3. Centered box.

## Guesses
- `presentation` is missing from the typed props of `modal.root`. I used it because the sheet's prose says to, and I assumed the type accepts it.
- I assumed a `modal.close` with an `onClick` runs the handler and also closes the dialog.
- I assumed a native checkbox binds through `checked` plus `onChange` with `event.currentTarget.checked`.
- I assumed setting `addressOpen = false` closes the modal when it is controlled through `open` and `onChange`.
- I assumed multi-statement arrow handlers (`{ a = x; b = false; }`) are allowed.
- The three address strings and the "Order deleted." message are placeholders I made up.

Tools used: none (only Read, to open the task file as instructed)
