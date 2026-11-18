```tsrx
// file: Orders.tsrx
import { computed, state } from '@markless/core';
import { platform } from '@markless/device';
import { drawer } from '@markless/ui';
import { ios } from '@markless/ios';
import { android } from '@markless/android';

type Filter = 'All' | 'Open' | 'Shipped';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	const statusOf: Record<string, 'Open' | 'Shipped'> = { 'A-1': 'Open', 'A-2': 'Shipped', 'A-3': 'Open' };
	let filter = state<Filter>('All');
	let open = state(false);
	const visible = computed(() => orders.filter((order) => filter === 'All' || statusOf[order] === filter));

	<main>
		<h1>Orders</h1>
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
		<ul>
			@for (const order of visible; key order) {
				<li>{order}</li>
			}
		</ul>
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
		<drawer.content style="position: fixed; left: 0; right: 0; bottom: 0; background: #5b21b6; color: #ffffff; border-radius: 24px 24px 0 0; padding: 24px;">
			<drawer.title>What's new</drawer.title>
			<p>Here is what changed in this release.</p>
			<drawer.close>Got it</drawer.close>
		</drawer.content>
	</drawer.root>
}
```

```tsrx
// file: Scan.tsrx
import { state } from '@markless/core';
import { camera, platform } from '@markless/device';
import { ios } from '@markless/ios';
import { android } from '@markless/android';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();
	let status = state('');

	<main>
		<h1>Scan a receipt</h1>
		@if (platform === 'web') {
			<p>Your browser will ask to use your camera when you press Scan.</p>
		} @else {
			<>
				<ios.camera el={cam} facing="back" />
				<android.camera el={cam} facing="back" />
			</>
		}
		<button
			onClick={async () => {
				status = 'Uploading…';
				await upload(await cam.takePhoto());
				status = 'Uploaded';
			}}
		>
			Scan
		</button>
		<p>{status}</p>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { platform } from '@markless/device';
import { ios } from '@markless/ios';
import { android } from '@markless/android';

export default function Invoice({ id }: { id: string }) @{
	const src = `/invoices/${id}.pdf`;

	<section>
		@if (platform === 'web') {
			<iframe src={src} title={`Invoice ${id}`} style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<>
				<ios.pdf src={src} />
				<android.pdf src={src} />
			</>
		}
	</section>
}
```

## Answers

A: In Orders, the phones show the filter sheet with `ios.sheet` and `android.sheet`. These are the system's own sheets, so they look and move like the sheets in the phone's other apps. The website shows `drawer` from `@markless/ui`, because nothing in the platform packages covers the web.

A: In WhatsNew, the panel is `drawer` on all three. It is a fully styleable element, so the designer's colour, text colour and corner radius come out the same everywhere. A system sheet would ignore that styling.

A: In Scan, the live preview on the phones is `ios.camera` and `android.camera`, both fed the `Camera` object from `camera()`. No preview element exists for the web.

A: In Invoice, the phones show the PDF with `ios.pdf` and `android.pdf`, the system PDF viewers. The website uses an `<iframe>`, which shows the PDF in the browser's built-in viewer.

B: Orders: a Filter button that opens a `drawer` panel with All, Open and Shipped choices and a Close button. Picking a choice filters the list.

B: WhatsNew: the same purple panel with rounded top corners, sliding up from the bottom, closed by "Got it".

B: Scan: a message and a Scan button with no live preview. Pressing Scan calls `camera().takePhoto()`, which I assume makes the browser ask for camera access, and the photo is then uploaded.

B: Invoice: the PDF embedded in the page through the browser's PDF viewer in an `<iframe>`.

Confidence: 2/5

## Guesses

The `ios.*` and `android.*` elements probably render nothing in the website build, so I put each native pair in the `@else` branch of an `@if (platform === 'web')` check and wrote my own website fallback.

I guessed the family parts are written as member-expression tags such as `<drawer.root>` and `<ios.sheet>`.

I guessed `camera().takePhoto()` works in a browser, through the browser's camera permission. There is no web preview element, and building one from a `<video>` would need an effect, which Markless does not have. So website visitors get no live preview.

I guessed the native sheets accept ordinary HTML buttons as children. `ios.menu` and `ios.item` looked like menus rather than sheet content.

I made up each order's status (A-1 Open, A-2 Shipped, A-3 Open), because the prompt only gives order IDs.

I guessed a `drawer.content` with a `style` set and no `drawer.trigger` still slides up from the bottom when `open` starts as `true`, and that `orientation="vertical"` means it moves up from the bottom.

I guessed `style` takes a CSS string.

The guidance says a callback prop takes at most one parameter. I assumed that rule allows handlers with several statements, like the ones in the filter buttons.

Tools used: none
