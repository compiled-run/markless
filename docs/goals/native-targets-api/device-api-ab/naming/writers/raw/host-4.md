```tsrx
// file: Orders.tsrx
import { computed, state } from '@markless/core';
import { platform } from '@markless/device';
import { host } from '@markless/host';
import { drawer } from '@markless/ui';

type Filter = 'All' | 'Open' | 'Shipped';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	const statusOf: Record<string, Filter> = { 'A-1': 'Open', 'A-2': 'Shipped', 'A-3': 'Open' };
	const choices: readonly Filter[] = ['All', 'Open', 'Shipped'];
	let filter = state<Filter>('All');
	let open = state(false);
	const visible = computed(() => orders.filter((o) => filter === 'All' || statusOf[o] === filter));

	<main>
		<ul>
			@for (const order of visible; key order) {
				<li>{order}</li>
			}
		</ul>
		@if (platform === 'web') {
			<drawer.root open={open} onChange={(next) => (open = next)} orientation="vertical">
				<drawer.trigger>Filter</drawer.trigger>
				<drawer.backdrop />
				<drawer.content>
					<drawer.title>Filter</drawer.title>
					@for (const choice of choices; key choice) {
						<button onClick={() => { filter = choice; open = false; }}>{choice}</button>
					}
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
	const src = `/invoices/${id}.pdf`;

	<section>
		@if (platform === 'web') {
			<iframe src={src} title={`Invoice ${id}`} style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<host.pdf src={src} />
		}
	</section>
}
```

## Answers

A:
Orders: `host.sheet` shows the sheet on iPhone and Android, because it is the only part that hands the sheet to the phone's own system sheet. It takes no `class` or `style`, which suggests it is drawn by the phone and not by us. On the website I use `drawer` from `@markless/ui`, because I can't tell whether `host.sheet` works in a browser.
WhatsNew: `drawer.content` inside `drawer.root`, because the designer's purple, white, 24px look has to be identical everywhere. Only the `@markless/ui` parts accept `style` and `class`, and `host.sheet` would look like each phone's own sheet instead.
Scan: `host.camera` with `el={camera()}` shows the live preview. It is the only preview element in the API, and the Scan button calls `takePhoto()` on that same `Camera` object.
Invoice: `host.pdf` on iPhone and Android, to use the phone's own PDF viewer. On the website it is a plain `<iframe>`, because browsers already show PDFs that way.

B:
Orders: a Filter button that opens a styled `drawer` panel with All, Open and Shipped. Picking one filters the list and closes the panel.
WhatsNew: the same purple panel with rounded top corners, open as soon as the page loads, with a "Got it" button that closes it.
Scan: a live preview from the computer's webcam and a Scan button that uploads the photo. This assumes `host.camera` works in a browser.
Invoice: the PDF shown in an iframe by the browser's own PDF viewer.

Confidence: 3/5

## Guesses

Order statuses: the orders are plain strings with no status, so I made up which ones are Open and which are Shipped (`statusOf`).

`host.sheet` on the web: I guessed it might not work in a browser, so I switch to `drawer` there. It might actually work and make the switch unnecessary.

`host.camera` on the web: I guessed it shows a live webcam preview in a browser, since the API offers nothing else for a preview.

`host.pdf` on the web: I guessed it might not work in a browser, so I use an iframe there.

Markup syntax: I guessed that family parts are written as tags like `<drawer.root>` and `<host.sheet>`, and that `style` takes a string.

Drawer behaviour: I guessed that `orientation="vertical"` plus my fixed bottom position makes the panel slide up from the bottom. I also guessed that `drawer.close` closes it through `onChange` even without a trigger.

Sheet sizes: I picked `sizes={['half']}` for the filter sheet.

Tools used: none
