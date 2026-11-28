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

	const addresses = ['12 Harbor Street, Apt 4', '88 Elm Avenue', '301 Market Road, Suite 9'];
	let addressOpen = state(false);
	let address = state(addresses[0]);

	<main>
		<section>
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
		</section>

		<section>
			@if (deleted) {
				<p>Order deleted.</p>
			} @else {
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
			}
		</section>

		<section>
			<p>
				Deliver to: <span>{address}</span>
			</p>
			<modal.root adaptive open={addressOpen} onChange={(open) => (addressOpen = open)}>
				<modal.trigger>Change</modal.trigger>
				<modal.backdrop>
					<modal.content>
						<modal.title>Saved addresses</modal.title>
						<ul>
							@for (const saved of addresses; key saved) {
								<li>
									<button
										onClick={() => {
											address = saved;
											addressOpen = false;
										}}
									>
										{saved}
									</button>
								</li>
							}
						</ul>
					</modal.content>
				</modal.backdrop>
			</modal.root>
		</section>
	</main>
}
```

Confidence: 3/5

## Phone
1. Filters: bottom sheet.
2. Delete: centered box (an alert dialog).
3. Deliver to: bottom sheet (the modal is marked `adaptive`).

## Website
1. Filters: bottom sheet (the sheet says a drawer slides in from the bottom on every platform).
2. Delete: centered box.
3. Deliver to: centered box.

## Guesses
- `adaptive` is not in the typed props of `modal.root`. I passed it anyway because the sheet's prose says to add it.
- I assumed `modal.close` and `drawer.close` close the dialog and still run their `onClick`, so the Delete button records the deletion and closes the box.
- I assumed `modal.trigger` opens the dialog by itself and calls `onChange(true)`, the same way the sheet says `drawer.trigger` does.
- I assumed setting `addressOpen = false` on a controlled `modal.root` closes it.
- I assumed the checkboxes inside the drawer keep their state between openings because the state lives in the page.
- I assumed `@if`/`@else` takes a plain state read as its condition, and that a component can hold a plain constant array.
- Labels, sample addresses and the "Order deleted." text are my own placeholders.

Tools used: none
