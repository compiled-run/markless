```tsx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

const addresses = [
	{ id: 1, label: 'Home, 12 Elm Street' },
	{ id: 2, label: 'Work, 400 Market Street' },
	{ id: 3, label: 'Mum, 7 Harbour Road' },
];

export default function Checkout() @{
	let vegan = state(false);
	let glutenFree = state(false);
	let underTen = state(false);
	let deleted = state(false);
	let addressOpen = state(false);
	let address = state(addresses[0].label);

	<main>
		<drawer.root>
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
		<modal.root open={addressOpen} onChange={(open) => (addressOpen = open)}>
			<modal.trigger>Change</modal.trigger>
			<modal.backdrop>
				<modal.content>
					<modal.title>Saved addresses</modal.title>
					<ul>
						@for (const item of addresses; key item.id) {
							<li>
								<button
									onClick={() => {
										address = item.label;
										addressOpen = false;
									}}
								>
									{item.label}
								</button>
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
1. Bottom sheet (the `drawer`).
2. Centered box (an alert `modal`).
3. Bottom sheet (a plain `modal`, drawn as a sheet on iPhone by default).

## Website
1. Bottom sheet (the `drawer` is a bottom sheet on every platform).
2. Centered box.
3. Centered box.

## Guesses
- Clicking `drawer.close` or `modal.close` closes the panel even when it also has an `onClick`, and a close part renders as a button whose label comes from its children.
- `modal.trigger` and `drawer.trigger` render as buttons, and their children become the label.
- In uncontrolled mode (no `open`), `modal.root` starts closed, just as the sheet says `drawer.root` does.
- Setting `addressOpen = false` on a controlled `modal.root` closes it, and the dismiss gestures (Escape, backdrop click, swipe) report through `onChange`.
- A block handler can run several statements with `{ ... }`, and a module-level constant array works in `@for`.
- The `checked` and `onChange` props on a native checkbox work as they do in the DOM.
- The alert dialog only needed a title, so I left out `modal.description`.

Tools used: none
