```tsrx
// file: Orders.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { native } from '@markless/native';
import { drawer } from '@markless/ui';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let open = state(false);
	let filter = state<'All' | 'Open' | 'Shipped'>('All');

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
				<native.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<div>
						<button onClick={() => { filter = 'All'; open = false; }}>All</button>
						<button onClick={() => { filter = 'Open'; open = false; }}>Open</button>
						<button onClick={() => { filter = 'Shipped'; open = false; }}>Shipped</button>
					</div>
				</native.sheet>
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
import { camera } from '@markless/device';
import { native } from '@markless/native';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();

	<main>
		<h1>Scan a receipt</h1>
		<native.camera el={cam} facing="back" />
		<button onClick={async () => upload(await cam.takePhoto())}>Scan</button>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { state } from '@markless/core';
import { native } from '@markless/native';

export default function Invoice({ id }: { id: string }) @{
	let page = state(1);

	<section>
		<native.pdf src={`/invoices/${id}.pdf`} page={page} onPageChange={(next) => (page = next)} />
	</section>
}
```

## Answers

A: Orders uses `native.sheet` on iPhone and Android, because a sheet that "looks and moves exactly like the phone's own apps" has to be the system's own sheet. On the website it uses `drawer.*`, because the declarations never say what `native.sheet` does in a browser. WhatsNew uses `drawer.*` on all three platforms, because it has to follow the designer's custom style and look the same everywhere. `native.sheet` takes no `class` or `style`, so it can't be styled, and it would look different on each phone. `drawer` takes everything a `<div>` takes. Scan uses `native.camera` with `el={camera()}`, because it is the only element listed that shows a live camera preview, and `Camera` comes from `@markless/device`, which includes `'web'` as a platform. Invoice uses `native.pdf`, because it is the only element listed that shows a PDF inside the page.

B: Orders: a website visitor sees the order list and a Filter button that opens a drawer sliding up from the bottom, with All, Open and Shipped choices. WhatsNew: they see the same purple panel with rounded top corners sliding up on load, and "Got it" closes it. Scan: they see a live webcam preview and a Scan button that uploads the photo, assuming the browser camera permission is granted. Invoice: they see the PDF shown inline in the page.

Confidence: 3/5

## Guesses

- How `native.sheet` behaves on the web is not documented, so I switched to `drawer` when `platform === 'web'`.
- I assumed `native.camera` and `camera()` work in a browser (a webcam preview) and that `native.pdf` shows the PDF inline on the web. Neither is documented.
- I assumed object members like `drawer.root` and `native.sheet` are used as JSX tags (`<drawer.root>`).
- I assumed `orientation="vertical"` makes the drawer slide up from the bottom. I also added fixed positioning myself, because I don't know where `drawer.content` is placed by default.
- I assumed `drawer.close` and the backdrop call `onChange(false)` on their own.
- I assumed a `style` string is accepted, since the declarations say `PropsOf<'div'>` includes `style`.
- I assumed an async handler is allowed for `takePhoto` and that errors from `upload` don't need handling.
- The orders have no status data, so the filter only records the choice and shows it. It doesn't remove orders from the list.
- Wrapping the phone branch in a fragment is fine, because each `@else` block holds exactly one node.

Tools used: none
