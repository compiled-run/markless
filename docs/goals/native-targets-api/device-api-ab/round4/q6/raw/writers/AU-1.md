```tsrx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

const addresses = ['12 Harbour Street, Leeds', '48 Elm Road, Bristol', '7 Mill Lane, York'];

export default function Checkout() @{
	let filtersOpen = state(false);
	let vegan = state(false);
	let glutenFree = state(false);
	let underTen = state(false);

	let deleteOpen = state(false);
	let deleted = state(false);

	let addressOpen = state(false);
	let address = state(addresses[0]);

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
			<modal.root open={addressOpen} onChange={(open) => (addressOpen = open)}>
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
		</p>
	</main>
}
```

Confidence: 3/5

## Phone
1. Filters: bottom sheet. The `drawer` is a bottom sheet on every platform.
2. Delete: centered box. An alert `modal` stays centered.
3. Change address: bottom sheet. A plain `modal` is drawn as a bottom sheet on iPhone by default.

## Website
1. Filters: bottom sheet. The drawer is a bottom sheet on the website too.
2. Delete: centered box.
3. Change address: centered box. A `modal` is a centered box on the website.

## Guesses
- I guessed that clicking `modal.close` closes the dialog and also runs its own `onClick`. I relied on that for the Delete button.
- I guessed that `onChange` fires when a trigger or close part changes the open state, so the state stays in sync with `open`. I also guessed that setting `addressOpen = false` closes the address list.
- I guessed that a part with no `onClick` handler, like `drawer.close` for Apply or `modal.close` for Cancel, still does its default job of closing.
- The filters apply live as each box is ticked; Apply only closes the panel. That was my choice, since the request didn't say the filters should wait for Apply.
- I made up the address strings and the "Order deleted." message.
- I guessed that a `modal.root` can sit inside a `<p>`, and that the root renders no wrapper that would break that.
- I guessed that native `checked` and `onChange` work on `<input type="checkbox">` the same way `value` and `onInput` do in the guidance.

Tools used: none
