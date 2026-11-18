```tsrx
// file: Orders.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { native } from '@markless/native';
import { drawer } from '@markless/ui';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	const choices = ['All', 'Open', 'Shipped'];
	let filter = state('All');
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
					@for (const choice of choices; key choice) {
						<button onClick={() => { filter = choice; open = false; }}>{choice}</button>
					}
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.root>
		} @else {
			<>
				<button onClick={() => (open = true)}>Filter</button>
				<native.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<div>
						@for (const choice of choices; key choice) {
							<button onClick={() => { filter = choice; open = false; }}>{choice}</button>
						}
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
import { native } from '@markless/native';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();

	<main>
		<native.camera el={cam} facing="back" />
		<button onClick={async () => { const photo = await cam.takePhoto(); await upload(photo); }}>Scan</button>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { platform } from '@markless/device';
import { native } from '@markless/native';

export default function Invoice({ id }: { id: string }) @{
	<section>
		@if (platform === 'web') {
			<iframe src={`/invoices/${id}.pdf`} title="Invoice" style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<native.pdf src={`/invoices/${id}.pdf`} />
		}
	</section>
}
```

## Answers

A: In Orders, `native.sheet` shows the sheet in the iPhone and Android apps, because it is the only element that can look and move like the phone's own sheets. On the website, `drawer` shows it, because nothing published says `native.sheet` works in a browser. In WhatsNew, `drawer.content` shows the panel on every platform, because it takes `style` and so can carry the designer's colours and corners. `native.sheet` takes no `class` or `style` and always looks like the system sheet, so it cannot match a custom design. In Scan, `native.camera` shows the preview, because it is the only element that takes the `Camera` returned by `camera()`. In Invoice, `native.pdf` shows the PDF in the apps, because it is the native viewer. On the website an `<iframe>` shows it, because the browser has its own PDF viewer and nothing published says `native.pdf` runs on the web.

B: In Orders, a website visitor sees the order list and a Filter button that opens a drawer with All, Open and Shipped, and picking one closes it. In WhatsNew, a website visitor sees the same purple panel with white text and 24px rounded top corners slide up when the page opens, and Got it closes it. In Scan, a website visitor sees a live preview from their computer's camera and a Scan button that uploads the photo, assuming `native.camera` has a browser version. In Invoice, a website visitor sees the PDF inside the page through the browser's PDF viewer.

Confidence: 3/5

## Guesses

Whether `native.sheet`, `native.camera` and `native.pdf` render anything on the web. Nothing published says, so I branched on `platform` for the sheet and the PDF. For the camera there is no other preview element, so I assumed `native.camera` works in a browser using the computer's camera.

That members of the `drawer` and `native` objects are used as tags, written `<drawer.root>` and `<native.sheet>`.

That `drawer.root` with `orientation="vertical"` slides in from the bottom, and that `drawer` with no trigger opens straight away when `open` starts as `true`.

That `style` takes a string.

That ordinary `<button>` markup can go inside `native.sheet` as its `Children`.

That an async click handler is allowed.

The orders have no status, so the chosen filter is shown as a label and the list is not actually filtered.

Tools used: none
