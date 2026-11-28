```tsrx
// file: Orders.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { drawer } from '@markless/ui';
import { host } from '@markless/host';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	const choices = ['All', 'Open', 'Shipped'] as const;
	let filter = state<'All' | 'Open' | 'Shipped'>('All');
	let open = state(false);

	<main>
		<h1>Orders: {filter}</h1>
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
					<drawer.title>Filter</drawer.title>
					<div>
						@for (const choice of choices; key choice) {
							<button onClick={() => { filter = choice; open = false; }}>{choice}</button>
						}
					</div>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.root>
		} @else {
			<>
				<button onClick={() => (open = true)}>Filter</button>
				<host.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<div>
						@for (const choice of choices; key choice) {
							<button onClick={() => { filter = choice; open = false; }}>{choice}</button>
						}
					</div>
				</host.sheet>
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
		<drawer.content style="background: #5b21b6; color: #fff; border-top-left-radius: 24px; border-top-right-radius: 24px;">
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
import { host } from '@markless/host';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();

	<main>
		<h1>Scan a receipt</h1>
		<host.camera el={cam} facing="back" />
		<button onClick={async () => upload(await cam.takePhoto())}>Scan</button>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { platform } from '@markless/device';
import { host } from '@markless/host';

export default function Invoice({ id }: { id: string }) @{
	<section>
		@if (platform === 'web') {
			<iframe src={`/invoices/${id}.pdf`} title="Invoice" style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<host.pdf src={`/invoices/${id}.pdf`} />
		}
	</section>
}
```

## Answers

A: Orders: on iPhone and Android, `host.sheet` shows the filter sheet, because it is the only element here that looks like the phone's own native sheet. Its props can't be styled, which suggests the operating system draws it. On the website, `drawer.root`/`drawer.content` from `@markless/ui` shows it instead.
WhatsNew: `drawer.content` shows the panel, because it takes `PropsOf<'div'>`, so it accepts `style` and can match the designer's spec exactly on all three platforms. `host.sheet` takes no `style` or `class`, so it can't be given the purple background or the rounded corners.
Scan: `host.camera` shows the preview, with `el` set to the `Camera` from `camera()`. It is the only element that renders a live preview, and `takePhoto()` on the same handle returns the Blob that goes to `upload`.
Invoice: `host.pdf` shows the PDF in the iPhone and Android apps. On the website, an `<iframe>` shows it, using the browser's built-in PDF viewer.

B: Orders: the website visitor sees a Filter button that opens a drawer, which is a web-drawn sheet with All, Open and Shipped buttons and a Close button.
WhatsNew: the visitor sees the same purple panel with rounded top corners sliding up when the page opens, and "Got it" closes it.
Scan: if the computer has a camera, the visitor sees a live camera preview, and Scan uploads a photo.
Invoice: the visitor sees the PDF inside an iframe on the page.

Confidence: 3/5

## Guesses

- I guessed that `host.*` elements may not render on the website, so I fell back to the drawer in Orders and an iframe in Invoice. I did not branch in Scan: I guessed `host.camera` falls back to a browser webcam preview on the web, because nothing else here can show one.
- I guessed that member tags such as `<drawer.root>` and `<host.sheet>` are valid in `.tsrx`.
- I guessed that `drawer.root` with `orientation="vertical"` slides up from the bottom, and that `open={true}` at the start makes it open on page load.
- I guessed that `style` accepts a CSS string.
- I guessed `sizes={['half']}` for the sheet height.
- Orders have no status data, so the filter only records the choice and shows it in the heading. It doesn't remove any orders from the list.
- I guessed that a `host.sheet` with no trigger part needs a plain button that sets `open`.

Tools used: none
