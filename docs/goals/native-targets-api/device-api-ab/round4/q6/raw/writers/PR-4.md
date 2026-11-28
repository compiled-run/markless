```tsrx
// file: pages/checkout.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

export default function Checkout() @{
	let filtersOpen = state(false);
	let vegan = state(false);
	let glutenFree = state(false);
	let underTen = state(false);

	let deleteOpen = state(false);
	let deleted = state(false);

	let addressOpen = state(false);
	let address = state('12 Harbour Street, Apt 4');

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
			Deliver to: {address}
		</p>
		<modal.root presentation="adaptive" open={addressOpen} onChange={(open) => (addressOpen = open)}>
			<modal.trigger>Change</modal.trigger>
			<modal.backdrop>
				<modal.content>
					<modal.title>Saved addresses</modal.title>
					<ul>
						<li>
							<button onClick={() => { address = '12 Harbour Street, Apt 4'; addressOpen = false; }}>12 Harbour Street, Apt 4</button>
						</li>
						<li>
							<button onClick={() => { address = '88 Elm Road'; addressOpen = false; }}>88 Elm Road</button>
						</li>
						<li>
							<button onClick={() => { address = '3 Station Lane, Office'; addressOpen = false; }}>3 Station Lane, Office</button>
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
1. Filters: a bottom sheet, which is a panel sliding up from the bottom (`drawer`).
2. Delete: a centered box, as an alert dialog (`modal` with `alert`).
3. Change address: a bottom sheet (`modal` with `presentation="adaptive"`).

## Website
1. Filters: a bottom sheet, because `drawer` slides in from the bottom on every platform.
2. Delete: a centered box.
3. Change address: a centered box, because `adaptive` only turns it into a bottom sheet on iPhone and Android.

## Guesses
- `presentation` is not in the typed props of `modal.root`. I used it because the platform notes say to set it there.
- I assumed `drawer.close` and `modal.close` close their panel by themselves, and that a plain `<button>` inside `modal.content` can close it by setting the bound `open` state to false.
- I assumed `open` together with `onChange` makes the panel controlled, so changing the state from a handler shows or hides it.
- I assumed `drawer.trigger` and `modal.trigger` render as buttons and toggle the panel even when `open` is controlled.
- I assumed a native checkbox with `checked` and `onChange` (reading `event.currentTarget.checked`) works as it does in the browser.
- Choosing an element: the address list could also have been a `drawer`. I picked an adaptive `modal` so the website shows a centered box rather than a bottom sheet.
- The "Order deleted." message after Delete is my addition. The task does not say what deleting should do.

Tools used: Read (once, to open the task file as the instructions said; no other tools)
