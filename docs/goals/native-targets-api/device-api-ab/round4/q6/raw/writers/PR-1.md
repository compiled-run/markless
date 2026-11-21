```tsrx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

const addresses = [
	{ id: 1, label: 'Home, 12 Elm Street' },
	{ id: 2, label: 'Work, 400 Market Street' },
	{ id: 3, label: "Mom's, 9 Lake Road" },
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
		<modal.root presentation="adaptive" open={addressOpen} onChange={(open) => (addressOpen = open)}>
			<modal.trigger>Change</modal.trigger>
			<modal.backdrop>
				<modal.content>
					<modal.title>Saved addresses</modal.title>
					<ul>
						@for (const saved of addresses; key saved.id) {
							<li>
								<modal.close onClick={() => (address = saved.label)}>{saved.label}</modal.close>
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
1. Filters: bottom sheet.
2. Delete: centered box (an alert dialog).
3. Change address: bottom sheet.

## Website
1. Filters: bottom sheet (the drawer comes up from the bottom edge on every platform).
2. Delete: centered box.
3. Change address: centered box.

## Guesses
- `presentation="adaptive"` isn't in the `modal.root` type signature. I used it because the sheet's prose says it is supported, so it may not typecheck.
- I assumed `modal.close` and `drawer.close` close the panel and still run their own `onClick`, so one press both saves the choice (or deletes) and closes.
- I assumed a `modal.root` can hold more than one `modal.close` (Delete and Cancel).
- I assumed passing `open` plus `onChange` makes it a controlled component and that the trigger still opens it. I could have left out `open` and `onChange` and let the trigger and close parts handle it.
- I assumed a module-level constant array can be used with `@for`.
- I assumed `Deliver to: {address}` with text and `{}` in one `<p>` is allowed.
- The filters panel is a bottom sheet on the website too, because the sheet says the drawer slides in from the bottom on every platform. A side panel on desktop wasn't offered without `orientation`/`start`, and those apply on every platform.

Tools used: none
