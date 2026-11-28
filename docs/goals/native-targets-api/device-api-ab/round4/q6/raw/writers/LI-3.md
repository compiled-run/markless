```tsx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { modal, drawer } from '@markless/ui';

const addresses = ['12 Oak Street, Springfield', '400 Market Ave, Apt 3B', '9 Harbor Road, Bayview'];

export default function Checkout() @{
	let vegan = state(false);
	let glutenFree = state(false);
	let underTen = state(false);
	let deleted = state(false);
	let address = state(addresses[0]);

	<main class="checkout">
		<section class="filters">
			<drawer.root>
				<drawer.trigger class="filters-button">Filters</drawer.trigger>
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
						<drawer.close class="apply">Apply</drawer.close>
					</drawer.content>
				</drawer.backdrop>
			</drawer.root>
		</section>

		<section class="order">
			@if (deleted) {
				<p>Order deleted.</p>
			} @else {
				<modal.root alert>
					<modal.trigger class="danger">Delete</modal.trigger>
					<modal.backdrop class="dialog-backdrop">
						<modal.content class="dialog">
							<modal.title>Delete this order?</modal.title>
							<div class="dialog-actions">
								<modal.close class="danger" onClick={() => (deleted = true)}>Delete</modal.close>
								<modal.close>Cancel</modal.close>
							</div>
						</modal.content>
					</modal.backdrop>
				</modal.root>
			}
		</section>

		<section class="deliver">
			<p>
				Deliver to: <span>{address}</span>
			</p>
			<drawer.root>
				<drawer.trigger>Change</drawer.trigger>
				<drawer.backdrop class="sheet-backdrop">
					<drawer.content class="sheet">
						<drawer.title>Saved addresses</drawer.title>
						<ul>
							@for (const option of addresses; key option) {
								<li>
									<drawer.close onClick={() => (address = option)}>{option}</drawer.close>
								</li>
							}
						</ul>
					</drawer.content>
				</drawer.backdrop>
			</drawer.root>
		</section>
	</main>
}
```

Confidence: 3/5

## Phone
1. Filters: bottom sheet
2. Delete confirmation: centered box (an alert dialog)
3. Deliver to / Change: bottom sheet

## Website
1. Filters: a panel that slides up from the bottom edge (a bottom sheet). The sheet says `drawer` is a bottom sheet on every platform.
2. Delete confirmation: centered box
3. Deliver to / Change: a panel that slides up from the bottom edge (a bottom sheet)

## Guesses
- I guessed that `drawer.close` and `modal.close` close their family even when they have an `onClick`, and that the `onClick` runs first. That is how I record the chosen address and the deletion without tracking `open` myself.
- I guessed that leaving out `open`/`onChange` on `modal.root` works the same as on `drawer.root`: it starts closed and the trigger opens it. The sheet only says this for `drawer`.
- I guessed that `<input type="checkbox" checked={...}>` with a native `onChange` and `event.currentTarget.checked` works on all three platforms. The sheet lists no checkbox component.
- I guessed that the `ui-*` parts accept children and text directly (the `children` prop in `Div`), and that I can put plain elements such as `<label>`, `<ul>` and `<div>` inside `drawer.content` and `modal.content`.
- I guessed that a bottom sheet is fine on a laptop website too. The sheet offers no per-platform switch, so the website gets the same bottom sheet.
- After Delete, I made up the "Order deleted." text. The prompt doesn't say what Delete should actually do.

Tools used: none
