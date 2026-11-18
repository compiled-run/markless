```tsrx
// file: pages/checkout.tsrx
import { state, computed } from '@markless/core';
import { drawer, modal } from '@markless/ui';

const addresses = [
	{ id: 1, label: 'Home, 12 Oak Street' },
	{ id: 2, label: 'Work, 400 Market Avenue' },
	{ id: 3, label: "Mum's, 7 Elm Close" },
];

export default function Checkout() @{
	let filtersOpen = state(false);
	let vegan = state(false);
	let glutenFree = state(false);
	let underTen = state(false);

	let deleteOpen = state(false);
	let deleted = state(false);

	let addressOpen = state(false);
	let addressId = state(1);
	const addressLabel = computed(() => addresses.find((a) => a.id === addressId)?.label ?? '');

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
			Deliver to: {addressLabel}
			<drawer.root open={addressOpen} onChange={(open) => (addressOpen = open)}>
				<drawer.trigger>Change</drawer.trigger>
				<drawer.backdrop>
					<drawer.content>
						<drawer.title>Saved addresses</drawer.title>
						<ul>
							@for (const address of addresses; key address.id) {
								<li>
									<button onClick={() => { addressId = address.id; addressOpen = false; }}>
										{address.label}
									</button>
								</li>
							}
						</ul>
					</drawer.content>
				</drawer.backdrop>
			</drawer.root>
		</p>
	</main>
}
```

Confidence: 3/5

## Phone
1. Filters: bottom sheet
2. Delete: centered box (an alert dialog)
3. Change address: bottom sheet

## Website
1. Filters: bottom sheet (the sheet says the drawer slides in from the bottom on every platform)
2. Delete: centered box
3. Change address: bottom sheet

## Guesses
- That parts are written as JSX tags (`<drawer.root>`) and that their children are rendered as the content of the part.
- That a controlled `open` combined with `onChange` is the right way to close a drawer or modal from my own button (the address choice, the modal's Delete), and that `drawer.close` and `modal.close` still close it when `open` is controlled.
- That `drawer.root` is allowed inside a `<p>`, since the parts render elements whose tags are not published; a `<div>` would be safer if a part renders block content.
- That a module-level constant array is fine and `@for` can loop over it.
- That `@if` without `@else` is allowed.
- That a native `checked`/`onChange` on a checkbox works as in the browser.
- That a bottom sheet is acceptable for the website too; no side-panel or popover option is published for laptops.

Tools used: none
