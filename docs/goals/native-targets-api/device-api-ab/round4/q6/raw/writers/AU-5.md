```tsrx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

const addresses = [
	{ id: 1, label: 'Home, 12 Elm Street' },
	{ id: 2, label: 'Work, 400 Market Street' },
	{ id: 3, label: "Mum's, 7 Rose Lane" },
];

export default function Checkout() @{
	let vegan = state(false);
	let glutenFree = state(false);
	let underTen = state(false);
	let deleted = state(false);
	let address = state(addresses[0].label);
	let addressOpen = state(false);

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
			<modal.root open={addressOpen} onChange={(open) => (addressOpen = open)}>
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
					</modal.content>
				</modal.backdrop>
			</modal.root>
		</p>
	</main>
}
```

Confidence: 3/5

## Phone
1. Filters: bottom sheet (`drawer`)
2. Delete: centered box (`modal` with `alert`)
3. Deliver to / Change: bottom sheet (plain `modal`, which is drawn as a sheet on phones by default)

## Website
1. Filters: bottom sheet (`drawer` is a bottom sheet on every platform)
2. Delete: centered box
3. Deliver to / Change: centered box

## Guesses
- I assumed `drawer.trigger`, `drawer.close`, `modal.trigger` and `modal.close` each render their own button and take text children, and that `close` still closes when I also give it an `onClick`.
- I assumed `modal.root` and `drawer.root` work uncontrolled when `open` is omitted. The sheet only says this for `drawer`. For `modal` it is my inference.
- I assumed that setting `addressOpen = false` on a controlled `modal.root` closes it, and that `onChange` keeps the state in sync when the user closes it another way.
- I assumed a `modal.root` is allowed inside a `<p>` and next to inline text. If its parts render block or dialog elements there, it may need a `<div>` instead.
- I assumed it is fine to leave out `modal.description` and `drawer.description`, and to have no `aria-label` when a title is present.
- I assumed a `@for` over a plain constant array and a handler with several statements are both valid.
- I assumed the "Delete" trigger and the "Delete" confirm button can share a label.
- The sheet does not say how to use the filters, so the page only stores them in state.

Tools used: none
