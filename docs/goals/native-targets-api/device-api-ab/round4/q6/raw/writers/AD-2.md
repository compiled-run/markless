```tsx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

const addresses = [
	{ id: 1, label: 'Home, 12 Elm Street' },
	{ id: 2, label: 'Work, 400 Market Avenue' },
	{ id: 3, label: 'Mom, 7 Lakeview Road' },
];

export default function Checkout() @{
	let vegan = state(false);
	let glutenFree = state(false);
	let underTen = state(false);
	let deleted = state(false);
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
			<modal.root adaptive>
				<modal.trigger>Change</modal.trigger>
				<modal.backdrop>
					<modal.content>
						<modal.title>Saved addresses</modal.title>
						<ul>
							@for (const item of addresses; key item.id) {
								<li>
									<modal.close onClick={() => (address = item.label)}>{item.label}</modal.close>
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
1. Filters: bottom sheet (drawer).
2. Delete: centered box (alert modal).
3. Deliver to / Change: bottom sheet (adaptive modal).

## Website
1. Filters: bottom sheet (the drawer slides up from the bottom on every platform).
2. Delete: centered box.
3. Deliver to / Change: centered box (adaptive only changes phones).

## Guesses
- The parts are imported as `import { drawer, modal } from '@markless/ui'` and used in JSX as `<drawer.root>`.
- `modal.trigger`, `modal.close`, `drawer.trigger` and `drawer.close` render their own buttons, and their children are the button labels.
- `modal.close` and `drawer.close` run their `onClick` and then close, so choosing an address (or Delete) can set state and close in one step.
- `adaptive` is accepted on `<modal.root>` even though it is not in the typed props. The sheet only says so in a comment.
- The `@if` block is fine without an `@else`.
- Putting the address modal inside a `<p>` is acceptable markup, since the modal content is likely rendered elsewhere or as a dialog.
- Native checkbox `checked` and `onChange` bind as in the browser.

Tools used: none
