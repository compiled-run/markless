```tsrx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

const addresses = [
	{ id: 1, label: '12 Oak Street, Springfield' },
	{ id: 2, label: '400 Market Ave, Apt 3B, Riverton' },
	{ id: 3, label: '9 Harbor Road, Bayside' },
];

export default function Checkout() @{
	let filtersOpen = state(false);
	let vegan = state(false);
	let glutenFree = state(false);
	let under10 = state(false);
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
						<input type="checkbox" checked={under10} onChange={(event) => (under10 = event.currentTarget.checked)} />
						Under $10
					</label>
					<drawer.close>Apply</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>

		<modal.root alert>
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
		<modal.root adaptive open={addressOpen} onChange={(open) => (addressOpen = open)}>
			<modal.trigger>Change</modal.trigger>
			<modal.backdrop>
				<modal.content>
					<modal.title>Saved addresses</modal.title>
					<ul>
						@for (const saved of addresses; key saved.id) {
							<li>
								<button
									onClick={() => {
										address = saved.label;
										addressOpen = false;
									}}
								>
									{saved.label}
								</button>
							</li>
						}
					</ul>
					<modal.close>Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</main>
}
```

Confidence: 3/5

## Phone
1. Filters: bottom sheet (`drawer`)
2. Delete: centered box (`modal` with `alert`)
3. Deliver to / Change: bottom sheet (`modal` with `adaptive`)

## Website
1. Filters: bottom sheet (`drawer` slides in from the bottom edge on every platform)
2. Delete: centered box
3. Deliver to / Change: centered box

## Guesses
- The `adaptive` prop is described in the sheet's prose but is missing from the `modal.root` type. I assumed it is accepted on `modal.root` anyway.
- I assumed `drawer.close` and `modal.close` render as buttons that close their root and take text children as the label. Apply is a `drawer.close`, and both confirm-dialog buttons are `modal.close`, with Delete also running its own `onClick`.
- I assumed that a controlled `open` together with `onChange` keeps the trigger and close parts working, and that setting `addressOpen = false` from a button inside the content closes the address modal.
- I assumed native checkbox `checked`/`onChange` with `event.currentTarget.checked` works as in the browser.
- I assumed `@if` with no `@else` is allowed.
- I assumed a module-level constant array is fine for the saved addresses.
- I assumed sibling parts (title, labels, buttons) inside `drawer.content`/`modal.content` are allowed, because the one-node rule applies only to `@` blocks.
- Filters is a drawer on the website too, so it is a bottom panel there; I took that as acceptable for a filter panel.

Tools used: Read, only to open the task file at /tmp/navab4/p/e5dd701f.md. No tools were used to write the answer.
