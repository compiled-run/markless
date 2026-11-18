```tsrx
// file: Orders.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { ios } from '@markless/ios';
import { android } from '@markless/android';
import { drawer } from '@markless/ui';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let filter = state<'All' | 'Open' | 'Shipped'>('All');
	let open = state(false);

	<main>
		<p>Filter: {filter}</p>
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
					<button onClick={() => { filter = 'All'; open = false; }}>All</button>
					<button onClick={() => { filter = 'Open'; open = false; }}>Open</button>
					<button onClick={() => { filter = 'Shipped'; open = false; }}>Shipped</button>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.root>
		} @else {
			<>
				<button onClick={() => (open = true)}>Filter</button>
				<ios.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<div>
						<button onClick={() => { filter = 'All'; open = false; }}>All</button>
						<button onClick={() => { filter = 'Open'; open = false; }}>Open</button>
						<button onClick={() => { filter = 'Shipped'; open = false; }}>Shipped</button>
					</div>
				</ios.sheet>
				<android.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<div>
						<button onClick={() => { filter = 'All'; open = false; }}>All</button>
						<button onClick={() => { filter = 'Open'; open = false; }}>Open</button>
						<button onClick={() => { filter = 'Shipped'; open = false; }}>Shipped</button>
					</div>
				</android.sheet>
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
		<drawer.content
			style="position: fixed; left: 0; right: 0; bottom: 0; background: #5b21b6; color: #ffffff; border-radius: 24px 24px 0 0; padding: 24px;"
		>
			<drawer.title>What's new</drawer.title>
			<p>Here is what changed in this release.</p>
			<drawer.close>Got it</drawer.close>
		</drawer.content>
	</drawer.root>
}
```

```tsrx
// file: Scan.tsrx
import { platform, camera } from '@markless/device';
import { ios } from '@markless/ios';
import { android } from '@markless/android';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();

	<main>
		@if (platform === 'web') {
			<p>Use your computer's camera to scan a receipt.</p>
		} @else {
			<>
				<ios.camera el={cam} facing="back" />
				<android.camera el={cam} facing="back" />
			</>
		}
		<button onClick={async () => upload(await cam.takePhoto())}>Scan</button>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { ios } from '@markless/ios';
import { android } from '@markless/android';

export default function Invoice({ id }: { id: string }) @{
	let page = state(1);

	<section>
		@if (platform === 'web') {
			<iframe src={`/invoices/${id}.pdf`} title="Invoice" style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<>
				<ios.pdf src={`/invoices/${id}.pdf`} page={page} onPageChange={(next) => (page = next)} />
				<android.pdf src={`/invoices/${id}.pdf`} page={page} onPageChange={(next) => (page = next)} />
			</>
		}
	</section>
}
```

## Answers

A: Orders uses `ios.sheet` and `android.sheet` in the apps, because only the system sheet looks and moves exactly like the sheets in the phone's own apps. The website uses `drawer` from `@markless/ui`, because the native packages have no website element. WhatsNew uses `drawer` from `@markless/ui` on all three platforms, because it has to follow a custom design and look the same everywhere, and a native sheet takes no style props. Scan uses `ios.camera` and `android.camera` for the live preview, fed by the `camera()` handle. The website gets no preview element, because none is declared for it. Invoice uses `ios.pdf` and `android.pdf` in the apps, and a plain `<iframe>` pointing at the PDF on the website.

B: On Orders, a website visitor sees the order list and a Filter button that opens a drawer with All, Open and Shipped. On WhatsNew, they see the same purple panel with rounded top corners that slides up on load, and "Got it" closes it. On Scan, they see an instruction line and a Scan button that calls `camera().takePhoto()`, with no live preview. On Invoice, they see the PDF in the browser's built-in viewer inside an iframe.

Confidence: 3/5

## Guesses

- I assumed that on the website neither the `ios` nor the `android` element renders, so I gated them with `platform === 'web'` and gave the website its own fallback.
- I assumed the parts are written as member-expression tags such as `<drawer.root>` and `<ios.sheet>`.
- I assumed `camera()` and `takePhoto()` also work in a browser with a camera. Nothing declares a live preview for the website, so the website has none.
- I assumed `drawer.content` takes inline `style` for the custom design, and that a drawer opens from the bottom with `orientation="vertical"`.
- I assumed `sizes={['half']}` is a sensible sheet height.
- The orders have no status, so the filter only records the choice and does not hide any orders.
- I assumed a statement block like `{ filter = 'All'; open = false; }` is allowed in a handler.
- I assumed `async` handlers are allowed.

Tools used: none
