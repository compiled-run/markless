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
	let applied = state('No filters');
	let deleted = state(false);
	let address = state(addresses[0].label);

	<main>
		<section>
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
						<drawer.close
							onClick={() =>
								(applied =
									[vegan ? 'Vegan' : '', glutenFree ? 'Gluten-free' : '', underTen ? 'Under $10' : '']
										.filter(Boolean)
										.join(', ') || 'No filters')
							}
						>
							Apply
						</drawer.close>
					</drawer.content>
				</drawer.backdrop>
			</drawer.root>
			<p>{applied}</p>
		</section>

		<section>
			@if (deleted) {
				<p>Order deleted.</p>
			} @else {
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
			}
		</section>

		<section>
			<p>Deliver to: {address}</p>
			<drawer.root>
				<drawer.trigger>Change</drawer.trigger>
				<drawer.backdrop>
					<drawer.content>
						<drawer.title>Saved addresses</drawer.title>
						<ul>
							@for (const saved of addresses; key saved.id) {
								<li>
									<drawer.close onClick={() => (address = saved.label)}>{saved.label}</drawer.close>
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
1. Filters: bottom sheet.
2. Delete: centered box (an alert dialog).
3. Deliver to / Change: bottom sheet.

## Website
1. Filters: bottom sheet. The sheet says a drawer slides up from the bottom on every platform, laptops included.
2. Delete: centered box.
3. Deliver to / Change: bottom sheet.

## Guesses
- I assumed `modal.trigger` opens its modal and `modal.close` closes it, the same way the drawer parts do. The sheet only says this for `drawer`.
- I assumed a close part's `onClick` runs and then the part closes the panel. I used that for Apply, for the Delete confirmation, and for picking an address.
- I assumed the parts are written as JSX tags like `<drawer.root>` and that they accept children such as text, labels and lists inside their content.
- I assumed `checked` plus `onChange` on a plain checkbox works like a native input, reading `event.currentTarget.checked`.
- I assumed a non-reactive module-level `addresses` array can be used in `@for`.
- I chose a bottom sheet over a centered box for the address list because it is a list you pick from. A centered modal would also work.
- The sheet does not say how `alert` changes what users see, so I assumed it only changes the role and behaviour, not the layout.

Tools used: none
