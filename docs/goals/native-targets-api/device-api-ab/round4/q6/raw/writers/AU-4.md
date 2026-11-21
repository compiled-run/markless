```tsrx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

export default function Checkout() @{
	let vegan = state(false);
	let glutenFree = state(false);
	let underTen = state(false);
	let filtersOpen = state(false);

	let deleteOpen = state(false);
	let deleted = state(false);

	let addressOpen = state(false);
	let address = state('12 Harbour Street, Leeds');

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
			Deliver to: <span>{address}</span>
		</p>
		<modal.root open={addressOpen} onChange={(open) => (addressOpen = open)}>
			<modal.trigger>Change</modal.trigger>
			<modal.backdrop>
				<modal.content>
					<modal.title>Saved addresses</modal.title>
					<ul>
						<li>
							<modal.close onClick={() => (address = '12 Harbour Street, Leeds')}>12 Harbour Street, Leeds</modal.close>
						</li>
						<li>
							<modal.close onClick={() => (address = '4 Mill Lane, York')}>4 Mill Lane, York</modal.close>
						</li>
						<li>
							<modal.close onClick={() => (address = '88 Station Road, Hull')}>88 Station Road, Hull</modal.close>
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
1. Filters: bottom sheet (drawer).
2. Delete: centered box (alert modal).
3. Change address: bottom sheet (modal with its default phone placement).

## Website
1. Filters: bottom sheet (the drawer is a bottom sheet on every platform).
2. Delete: centered box.
3. Change address: centered box.

## Guesses
- I assumed `drawer.close` and `modal.close` close the panel themselves and still run their `onClick`, so the Delete button and each address can both record the choice and close.
- I assumed native checkbox `onChange` with `event.currentTarget.checked` works, and that writing `checked={state}` keeps the box in sync.
- I assumed `open` together with `onChange` makes the open state controlled, and that the trigger and close parts still update it through `onChange`.
- I assumed text placed directly inside `drawer.trigger`/`modal.trigger` becomes the button label, and that these parts render as buttons.
- I left out `modal.description` for the delete dialog, since the title already holds the question.
- I made up the addresses and the default address.

Tools used: none
