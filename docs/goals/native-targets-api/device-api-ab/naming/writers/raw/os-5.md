```tsx
// file: Orders.tsrx
import { computed, state } from '@markless/core';
import { platform } from '@markless/device';
import { drawer } from '@markless/ui';
import { os } from '@markless/os';

const orders = ['A-1', 'A-2', 'A-3'];
const statusOf: Record<string, 'Open' | 'Shipped'> = { 'A-1': 'Open', 'A-2': 'Shipped', 'A-3': 'Open' };

export default function Orders() @{
	let filter = state<'All' | 'Open' | 'Shipped'>('All');
	let open = state(false);
	const shown = computed(() => orders.filter((id) => filter === 'All' || statusOf[id] === filter));

	<main>
		<button onClick={() => (open = true)}>Filter: {filter}</button>
		<ul>
			@for (const id of shown; key id) {
				<li>{id}</li>
			}
		</ul>
		@if (platform === 'web') {
			<drawer.root open={open} onChange={(next) => (open = next)} orientation="vertical">
				<drawer.backdrop />
				<drawer.content>
					<drawer.title>Filter</drawer.title>
					<button onClick={() => { filter = 'All'; open = false; }}>All</button>
					<button onClick={() => { filter = 'Open'; open = false; }}>Open</button>
					<button onClick={() => { filter = 'Shipped'; open = false; }}>Shipped</button>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.root>
		} @else {
			<os.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
				<>
					<button onClick={() => { filter = 'All'; open = false; }}>All</button>
					<button onClick={() => { filter = 'Open'; open = false; }}>Open</button>
					<button onClick={() => { filter = 'Shipped'; open = false; }}>Shipped</button>
				</>
			</os.sheet>
		}
	</main>
}
```

```tsx
// file: WhatsNew.tsrx
import { state } from '@markless/core';
import { drawer } from '@markless/ui';

export default function WhatsNew() @{
	let open = state(true);

	<drawer.root open={open} onChange={(next) => (open = next)} orientation="vertical">
		<drawer.backdrop />
		<drawer.content style="background: #5b21b6; color: #ffffff; border-radius: 24px 24px 0 0; position: fixed; left: 0; right: 0; bottom: 0;">
			<drawer.title>What's new</drawer.title>
			<p>Here is what changed in this release.</p>
			<drawer.close>Got it</drawer.close>
		</drawer.content>
	</drawer.root>
}
```

```tsx
// file: Scan.tsrx
import { camera } from '@markless/device';
import { os } from '@markless/os';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();

	<main>
		<os.camera el={cam} facing="back" />
		<button onClick={async () => upload(await cam.takePhoto())}>Scan</button>
	</main>
}
```

```tsx
// file: Invoice.tsrx
import { platform } from '@markless/device';
import { os } from '@markless/os';

export default function Invoice({ id }: { id: string }) @{
	const src = `/invoices/${id}.pdf`;

	<section>
		@if (platform === 'web') {
			<iframe src={src} title={`Invoice ${id}`} style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<os.pdf src={src} />
		}
	</section>
}
```

## Answers

A:
Orders: on iPhone and Android, `os.sheet` shows the filter sheet, because only the phone's own sheet looks and moves exactly like the sheets in the phone's apps. On the website, `drawer.root` and `drawer.content` show it, because nothing says `os.sheet` works in a browser. The `drawer` family is a styleable web component.

WhatsNew: `drawer.content` shows the panel on all three platforms, because the designer's spec needs custom colours and corners that look the same everywhere. `os.sheet` takes no `class` or `style` and would look different on each phone.

Scan: `os.camera`, given `camera()`, shows the live preview, because it is the only preview element and it takes the same `Camera` object whose `takePhoto()` returns the `Blob` for `upload`.

Invoice: on the phones, `os.pdf` shows the PDF, because it is the phone's own PDF viewer. On the website, an `<iframe>` shows it, so the browser's built-in PDF viewer displays it inside the page.

B:
Orders: a Filter button that opens a web drawer sliding up from the bottom, with All, Open, Shipped and Close buttons.

WhatsNew: the same purple panel with white text and 24px rounded top corners, open when the page loads, closed by "Got it".

Scan: a live webcam preview with a Scan button, assuming `os.camera` and `camera()` work in a browser.

Invoice: the PDF shown inside the page by the browser's own PDF viewer.

Confidence: 3/5

## Guesses

- I guessed that `os.*` elements do not render on `platform === 'web'`, so I only fall back for the sheet and the PDF.
- For the camera I guessed the opposite: that `os.camera` with `camera()` also works in a browser, using the computer's webcam. If it does not, website visitors cannot scan.
- The JSX element names `<drawer.root>` and `<os.sheet>` are my guess at how these functions are used as elements.
- I guessed that `drawer.root` with `orientation="vertical"` slides up from the bottom.
- I guessed that `drawer.content` accepts `style` as a string, and added fixed bottom positioning myself.
- I guessed that `os.sheet` accepts a single fragment as its children.
- I made up the order statuses (`statusOf`), because the order list only gives IDs.
- I guessed that `os.pdf` resolves a path relative to the site, like `/invoices/...`, inside the native apps.
- I guessed that a handler can be `async` and that `drawer.close` closes the drawer through `onChange`.

Tools used: none
