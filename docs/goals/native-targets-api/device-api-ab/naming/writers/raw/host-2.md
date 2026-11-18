```tsrx
// file: Orders.tsrx
import { computed, state } from '@markless/core';
import { platform } from '@markless/device';
import { drawer } from '@markless/ui';
import { host } from '@markless/host';

const orders = ['A-1', 'A-2', 'A-3'];
const statusOf: Record<string, 'Open' | 'Shipped'> = { 'A-1': 'Open', 'A-2': 'Shipped', 'A-3': 'Open' };

export default function Orders() @{
	let filter = state<'All' | 'Open' | 'Shipped'>('All');
	let open = state(false);
	const visible = computed(() => orders.filter((o) => filter === 'All' || statusOf[o] === filter));

	<main>
		<ul>
			@for (const order of visible; key order) {
				<li>{order}</li>
			}
		</ul>
		@if (platform === 'web') {
			<drawer.root open={open} onChange={(next) => (open = next)}>
				<drawer.trigger>Filter</drawer.trigger>
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
			<>
				<button onClick={() => (open = true)}>Filter</button>
				<host.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<div>
						<button onClick={() => { filter = 'All'; open = false; }}>All</button>
						<button onClick={() => { filter = 'Open'; open = false; }}>Open</button>
						<button onClick={() => { filter = 'Shipped'; open = false; }}>Shipped</button>
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
		<drawer.content style="background: #5b21b6; color: white; border-radius: 24px 24px 0 0; padding: 24px;">
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

A: In Orders, `host.sheet` shows the sheet on iPhone and Android, because it is the phone's own sheet and so looks and moves like the sheets in the phone's apps. On the website `drawer` shows it, because I don't know whether `host.sheet` works on the web. In WhatsNew, `drawer` shows the panel on every platform: `host.sheet` takes no `class` or `style`, so it can't follow the designer's spec, while `drawer.content` takes `PropsOf<'div'>`, so it can be styled the same everywhere. In Scan, `host.camera` shows the preview. It is the only preview element, and it takes the `Camera` from `camera()`, which also takes the photo. In Invoice, `host.pdf` shows the PDF on phones and an `<iframe>` shows it on the website, using the browser's own PDF viewer.

B: In Orders, a website visitor sees a Filter button that opens a sliding drawer with All, Open, Shipped and Close. In WhatsNew, they see the same purple panel with rounded top corners as the apps, open when the page loads, with a "Got it" button that closes it. In Scan, they see a live webcam preview from `host.camera`, which I assume uses the browser camera, and a Scan button. In Invoice, they see the PDF in the browser's viewer inside the page.

Confidence: 3/5

## Guesses

Whether `host.*` elements render anything on the web. I guessed no for `sheet` and `pdf` and added web fallbacks, but yes for `camera`, which has no fallback.

That `orientation="vertical"` makes the drawer slide up from the bottom.

That `drawer.root` with `open` set to true at the start opens the panel when the page loads.

The order statuses: the prompt gives only order IDs, so I made up an Open or Shipped status for each.

That `sizes={['half']}` fits a three-choice filter sheet.

That family parts are used as `<drawer.root>` and `<host.sheet>`, and that a `style` string is accepted.

That an async click handler is fine, and that a handler can set two state values in one block.

Tools used: none
