```tsrx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

const addresses = ['12 Oak Street, Springfield', '400 Market Ave, Apt 3B, Riverton', '9 Harbor Road, Lakeside'];

export default function Checkout() @{
	let vegan = state(false);
	let glutenFree = state(false);
	let underTen = state(false);

	let deleted = state(false);

	let address = state(addresses[0]);
	let addressOpen = state(false);

	<main>
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
					<drawer.close class="apply-button">Apply</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>

		@if (deleted) {
			<p>Order deleted.</p>
		} @else {
			<modal.root alert>
				<modal.trigger class="delete-button">Delete</modal.trigger>
				<modal.backdrop class="dialog-backdrop">
					<modal.content class="alert-box">
						<modal.title>Delete this order?</modal.title>
						<div class="alert-actions">
							<modal.close class="danger" onClick={() => (deleted = true)}>Delete</modal.close>
							<modal.close>Cancel</modal.close>
						</div>
					</modal.content>
				</modal.backdrop>
			</modal.root>
		}

		<p class="deliver-to">
			Deliver to: <span>{address}</span>
			<modal.root open={addressOpen} onChange={(open) => (addressOpen = open)}>
				<modal.trigger class="change-button">Change</modal.trigger>
				<modal.backdrop class="dialog-backdrop">
					<modal.content aria-label="Saved addresses">
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
		</p>
	</main>
}
```

Confidence: 3/5

## Phone
1. Filters: bottom sheet (I used `drawer`, which is a bottom sheet on every platform).
2. Delete: centered box (I used `modal.root alert`, which stays centered).
3. Change address: bottom sheet (I used a plain `modal`, which phones draw as a bottom sheet by default).

## Website
1. Filters: bottom sheet (`drawer` is a bottom sheet on every platform).
2. Delete: centered box.
3. Change address: centered box.

## Guesses
- I guessed that `modal.trigger`, `drawer.trigger` and `modal.close`/`drawer.close` take their label as children and render as buttons.
- I guessed that a `modal.close` with an `onClick` both runs the handler and closes the dialog, so the Delete button can mark the order deleted.
- I guessed that a root with no `open` prop manages its own open state (the sheet says this for `drawer`; I assumed the same for `modal`). I also guessed that setting `open={addressOpen}` together with `onChange` makes the address list controlled, so setting `addressOpen = false` closes it.
- I guessed that a `modal.root` (a dialog) is allowed inside a `<p>` and that its trigger renders inline there.
- I guessed that a checkbox's `checked` binding with `onChange` reading `event.currentTarget.checked` works the way native checkboxes do.
- I assumed the filters do not need to filter anything yet (nothing reads the checkbox state) and that an `@for` key can be the address string.
- I wrapped every callback that does more than one assignment in a block body. I assumed that is allowed in handlers.

Tools used: none
