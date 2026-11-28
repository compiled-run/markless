```tsrx
// file: Orders.tsrx
import { computed, state } from '@markless/core';
import { platform } from '@markless/device';
import { system } from '@markless/system';
import { drawer } from '@markless/ui';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let open = state(false);
	let filter = state('All');
	const shown = computed(() => (filter === 'All' ? orders : orders.filter(() => true)));

	<main>
		<p>Filter: {filter}</p>
		<ul>
			@for (const order of shown; key order) {
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
				<system.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<div>
						<button onClick={() => { filter = 'All'; open = false; }}>All</button>
						<button onClick={() => { filter = 'Open'; open = false; }}>Open</button>
						<button onClick={() => { filter = 'Shipped'; open = false; }}>Shipped</button>
					</div>
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
		<drawer.content style="background: #5b21b6; color: #fff; border-radius: 24px 24px 0 0;">
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
	const src = `/invoices/${id}.pdf`;

	<section>
		@if (platform === 'web') {
			<iframe src={src} title="Invoice" style="width: 100%; height: 80vh;" />
		} @else {
			<system.pdf src={src} />
		}
	</section>
}
```

## Answers

A:
- Orders: `system.sheet` on iPhone and Android, because `@markless/system` reads as the phone's own built-in UI, which gives the sheet the same look and motion as the phone's apps. On the website it uses `drawer` from `@markless/ui`, because nothing published says `system.sheet` works in a browser.
- WhatsNew: `drawer.content` on every platform. A custom design that must look identical on all three needs a component we style ourselves, and the `drawer` parts accept `style` through `PropsOf<'div'>`. A system sheet would follow each phone's own look instead.
- Scan: `system.camera` fed by `camera()` from `@markless/device`. It is the only live-preview element published, and `camera()` provides the `takePhoto()` the Scan button needs.
- Invoice: `system.pdf` in the phone apps, because it is the only PDF viewer published. On the website it uses an `<iframe>`, because browsers show PDFs on their own.

B:
- Orders: a Filter button that opens a styled bottom drawer with All, Open and Shipped.
- WhatsNew: the same purple panel with rounded top corners, open when the page loads, with a "Got it" button.
- Scan: a live webcam preview, assuming `system.camera` and `camera()` work in the browser, and a Scan button that uploads the photo.
- Invoice: the browser's own PDF viewer inside the page.

Confidence: 2/5

## Guesses

- Whether any `system.*` element works on the web. I assumed sheet and pdf might not and branched on `platform`. I assumed camera does, because the task expects website scanning to work.
- That `drawer.root` with `orientation="vertical"` opens from the bottom.
- That `drawer.root` starts open when given `open={true}`, and that `drawer.close` sets `open` to false through `onChange`.
- That `system.*` and `drawer.*` are written as `<system.sheet>` / `<drawer.root>` tags, and that `style` takes a string.
- That `system.sheet` has no built-in trigger, so I added a plain button.
- How the Open and Shipped filters should work. The orders carry no status, so the filtered list is a placeholder.
- That `system.pdf` needs no size given.

Tools used: none
