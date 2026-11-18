```tsrx
// file: Orders.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { system } from '@markless/system';
import { drawer } from '@markless/ui';

const orders = ['A-1', 'A-2', 'A-3'];
type Filter = 'All' | 'Open' | 'Shipped';

function Choices({ onPick }: { onPick: (filter: Filter) => void }) @{
	<div>
		<button onClick={() => onPick('All')}>All</button>
		<button onClick={() => onPick('Open')}>Open</button>
		<button onClick={() => onPick('Shipped')}>Shipped</button>
	</div>
}

export default function Orders() @{
	let filter = state<Filter>('All');
	let open = state(false);

	<main>
		<p>Showing: {filter}</p>
		<ul>
			@for (const order of orders; key order) {
				<li>{order}</li>
			}
		</ul>
		@if (platform === 'web') {
			<drawer.root open={open} onChange={(next) => (open = next)} orientation="vertical">
				<drawer.trigger>Filter</drawer.trigger>
				<drawer.backdrop />
				<drawer.content>
					<drawer.title>Filter orders</drawer.title>
					<Choices onPick={(next) => { filter = next; open = false; }} />
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.root>
		} @else {
			<>
				<button onClick={() => (open = true)}>Filter</button>
				<system.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<Choices onPick={(next) => { filter = next; open = false; }} />
				</system.sheet>
			</>
		}
	</main>
}
```

```tsrx
// file: WhatsNew.tsrx
import { state } from '@markless/core';
import { drawer } from '@markless/ui';

export default function WhatsNew() @{
	let open = state(true);

	<drawer.root open={open} onChange={(next) => (open = next)} orientation="vertical">
		<drawer.backdrop />
		<drawer.content style="background: #5b21b6; color: #ffffff; border-radius: 24px 24px 0 0;">
			<drawer.title>What's new</drawer.title>
			<p>Here is what changed in this release.</p>
			<drawer.close>Got it</drawer.close>
		</drawer.content>
	</drawer.root>
}
```

```tsrx
// file: Scan.tsrx
import { camera } from '@markless/device';
import { system } from '@markless/system';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();

	<main>
		<system.camera el={cam} facing="back" />
		<button onClick={async () => upload(await cam.takePhoto())}>Scan</button>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { platform } from '@markless/device';
import { system } from '@markless/system';

export default function Invoice({ id }: { id: string }) @{
	<section>
		@if (platform === 'web') {
			<iframe src={`/invoices/${id}.pdf`} title="Invoice" style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<system.pdf src={`/invoices/${id}.pdf`} />
		}
	</section>
}
```

## Answers

A:
- **Orders:** On iPhone and Android, `system.sheet` shows the sheet. It is the phone's own sheet, so it looks and moves exactly like the sheets in the phone's apps. On the website, `drawer.root` shows it, because nothing in the declarations says `system.sheet` works in a browser.
- **WhatsNew:** `drawer.root` and `drawer.content` show the panel. `drawer.content` accepts `style` and `class`, so it can follow the designer's spec and look the same everywhere. `system.sheet` takes no styling props and would look different on each platform.
- **Scan:** `system.camera` shows the preview, fed by the `Camera` that `camera()` returns. No other element in the declarations shows a live camera preview.
- **Invoice:** On the phone apps, `system.pdf` shows the PDF with the phone's own viewer. On the website, an `<iframe>` shows it with the browser's built-in PDF viewer.

B:
- **Orders:** A Filter button that opens a drawer sliding up from the bottom, with a backdrop, a title, the All, Open and Shipped choices, and a Close button.
- **WhatsNew:** A purple drawer with white text and 24px rounded top corners, open when the page loads, which "Got it" closes.
- **Scan:** A live preview from the computer's camera and a Scan button that uploads a photo.
- **Invoice:** The PDF shown inside the page by the browser's own PDF viewer.

Confidence: 3/5

## Guesses

- I assumed `system.*` elements are native-only and may not render in a browser, which is why I switched on `platform` in Orders and Invoice. If they do work on the web, the branches are unnecessary.
- I assumed `system.camera` works on the web and shows a preview from the browser's camera. The declarations offer no other way to show a preview.
- I assumed `orientation="vertical"` makes the drawer slide up from the bottom.
- I assumed `style` takes a CSS string in `.tsrx`.
- I assumed that `<drawer.trigger>` opens the drawer and `<drawer.close>` closes it, both through `onChange`.
- The orders have no status data, so I only record and display the chosen filter and don't actually filter the list.
- I passed `sizes={['half']}` to the sheet, and I assumed `system.pdf` resolves a relative URL on the phone apps.
- I used `@if`/`@else` with a `<>…</>` fragment to hold more than one element in the native branch.
- I assumed that handlers which call `upload(...)` or set two state values in one block are allowed.

Tools used: none
