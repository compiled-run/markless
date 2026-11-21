```tsrx
// file: Orders.tsrx
import { computed, state } from '@markless/core';
import { platform } from '@markless/device';
import { drawer } from '@markless/ui';
import { system } from '@markless/system';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let open = state(false);
	let filter = state('All');
	const choices = ['All', 'Open', 'Shipped'];
	const native = platform !== 'web';

	<main>
		<h1>Orders ({filter})</h1>
		<ul>
			@for (const order of orders; key order) {
				<li>{order}</li>
			}
		</ul>
		@if (native) {
			<>
				<button onClick={() => (open = true)}>Filter</button>
				<system.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<ul>
						@for (const choice of choices; key choice) {
							<li>
								<button onClick={() => { filter = choice; open = false; }}>{choice}</button>
							</li>
						}
					</ul>
				</system.sheet>
			</>
		} @else {
			<drawer.root open={open} onChange={(next) => (open = next)} orientation="vertical">
				<drawer.trigger>Filter</drawer.trigger>
				<drawer.backdrop />
				<drawer.content>
					<drawer.title>Filter</drawer.title>
					<ul>
						@for (const choice of choices; key choice) {
							<li>
								<button onClick={() => { filter = choice; open = false; }}>{choice}</button>
							</li>
						}
					</ul>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.root>
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
		<drawer.content style="position: fixed; left: 0; right: 0; bottom: 0; background: #5b21b6; color: #fff; border-radius: 24px 24px 0 0; padding: 24px;">
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
		<h1>Scan a receipt</h1>
		<system.camera el={cam} facing="back" />
		<button onClick={async () => upload(await cam.takePhoto())}>Scan</button>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { system } from '@markless/system';

export default function Invoice({ id }: { id: string }) @{
	let page = state(1);
	const src = `/invoices/${id}.pdf`;

	<section>
		@if (platform === 'web') {
			<iframe src={src} title={`Invoice ${id}`} style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<system.pdf src={src} page={page} onPageChange={(next) => (page = next)} />
		}
	</section>
}
```

## Answers

A:
- Orders: `system.sheet` shows the filter sheet in the iPhone and Android apps. It is the phone's own sheet, so it looks and moves like the sheets in the phone's built-in apps. On the website, `drawer` from `@markless/ui` shows it, because nothing says `system.sheet` exists in a browser.
- WhatsNew: `drawer` shows the panel. It is a normal styled element, so the designer's purple, white text and 24px top corners look the same on all three targets. A system sheet would use each phone's own look and ignore the spec.
- Scan: `system.camera` shows the preview, driven by `camera()` from `@markless/device`. `takePhoto()` on that same handle captures the photo, which goes to `upload`.
- Invoice: `system.pdf` shows the PDF in the iPhone and Android apps. On the website an `<iframe>` shows it, using the browser's built-in PDF viewer, because nothing says `system.pdf` works on the web.

B:
- Orders: the order list and a Filter button that opens a sliding drawer with All, Open and Shipped, plus a Close button.
- WhatsNew: the same purple panel, already open at the bottom when the page loads. "Got it" closes it.
- Scan: a live preview from the computer's webcam, which I assume `system.camera` shows using the browser's camera access, and a Scan button that uploads the photo.
- Invoice: the PDF inside the page, in the browser's own PDF viewer.

Confidence: 3/5

## Guesses

- Whether `system.sheet`, `system.camera` and `system.pdf` show anything on `platform === 'web'`. Nothing published says, so I used a fallback for the sheet and the PDF. For the camera I assumed it works in the browser.
- That family members and namespace members are written as `<drawer.root>` and `<system.sheet>` in `.tsrx`.
- That `drawer.root` with `orientation="vertical"` slides up from the bottom, and that I need to pin the content to the bottom with inline `position: fixed`.
- That `drawer.close` and `drawer.trigger` change the drawer's open state through `onChange`, without extra wiring.
- That calling `camera()` once in the body is enough, and that the handle is ready by the time Scan is pressed.
- That `sizes={['half']}` is the right size for a three-choice filter sheet.
- That a handler with a multi-statement block body (`{ filter = choice; open = false; }`) is allowed.

Tools used: none
