```tsx
// file: Orders.tsrx
import { state, computed } from '@markless/core';
import { platform } from '@markless/device';
import { os } from '@markless/os';
import { drawer } from '@markless/ui';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let open = state(false);
	let filter = state('All');
	const choices = ['All', 'Open', 'Shipped'];

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
				<os.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<div>
						@for (const choice of choices; key choice) {
							<button onClick={() => { filter = choice; open = false; }}>{choice}</button>
						}
					</div>
				</os.sheet>
			</>
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
		<drawer.content style="background: #5b21b6; color: #ffffff; border-radius: 24px 24px 0 0;">
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
		<button onClick={async () => { const photo = await cam.takePhoto(); await upload(photo); }}>Scan</button>
	</main>
}
```

```tsx
// file: Invoice.tsrx
import { platform } from '@markless/device';
import { os } from '@markless/os';

export default function Invoice({ id }: { id: string }) @{
	<section>
		@if (platform === 'web') {
			<iframe src={`/invoices/${id}.pdf`} title="Invoice" style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<os.pdf src={`/invoices/${id}.pdf`} />
		}
	</section>
}
```

## Answers

A:
- **Orders:** in the iPhone and Android apps, `os.sheet` shows the filter sheet, because it is the platform's own sheet, so it looks and moves like the sheets in the phone's apps. On the website, `drawer` shows it, because nothing published says `os.sheet` works in a browser.
- **WhatsNew:** `drawer.content` shows the panel, because it takes `PropsOf<'div'>`, so it accepts `style`. That means the purple background, white text and rounded corners render the same on all three platforms. `os.sheet` takes no `style` or `class`, and it would look different on each platform anyway.
- **Scan:** `os.camera` shows the preview, bound to `camera()` from `@markless/device`. The Scan button calls `takePhoto()` on that same `Camera` object and passes the photo to `upload`.
- **Invoice:** in the apps, `os.pdf` shows the PDF, because it is the system's PDF viewer. On the website, an `<iframe>` shows it, because browsers display PDFs in an iframe natively.

B:
- **Orders:** a Filter button that opens a drawer sliding up from the bottom, with All, Open and Shipped buttons and a Close button.
- **WhatsNew:** the same purple drawer as in the apps, open when the page loads. "Got it" closes it.
- **Scan:** if `os.camera` works in a browser, a live webcam preview and a Scan button. If it doesn't, an empty spot where the preview should be.
- **Invoice:** the browser's own PDF viewer, embedded in the page.

Confidence: 3/5

## Guesses

- Whether the `os.*` elements render anything on the website. I assumed they don't for the sheet and the PDF, so I branch on `platform` for those two. For the camera I assumed `os.camera` works in a browser, because nothing published gives me another way to show a preview linked to `Camera.takePhoto()`.
- That `orientation="vertical"` makes the drawer slide up from the bottom. Nothing says which edge it uses.
- That the sheet's `onChange` also fires when the user swipes it closed, and that `sizes={['half']}` is the right size for three choices.
- That family parts are used as `<drawer.root>` and `<os.sheet>` in markup, and that `style` takes a string.
- That a drawer with `open={true}` at start counts as "slides up when the page opens", and that `drawer.close` sets `open` to false through `onChange`.
- That an async handler can await `takePhoto()` and `upload()` without wrapping them in `@try`.

Tools used: none
