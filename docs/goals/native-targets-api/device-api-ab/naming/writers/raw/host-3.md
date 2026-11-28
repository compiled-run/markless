```tsrx
// file: Orders.tsrx
import { state, computed } from '@markless/core';
import { platform } from '@markless/device';
import { drawer } from '@markless/ui';
import { host } from '@markless/host';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let open = state(false);
	let filter = state('All');
	const choices = ['All', 'Open', 'Shipped'];

	<main>
		<h1>Orders ({filter})</h1>
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
		<drawer.content style="background: #5b21b6; color: white; border-radius: 24px 24px 0 0;">
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
		<button onClick={async () => await upload(await cam.takePhoto())}>Scan</button>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { state } from '@markless/core';
import { host } from '@markless/host';

export default function Invoice({ id }: { id: string }) @{
	let page = state(1);

	<section>
		<host.pdf src={`/invoices/${id}.pdf`} page={page} onPageChange={(next) => (page = next)} />
	</section>
}
```

## Answers

A:
Orders: on iPhone and Android, `host.sheet` shows the filter sheet, because `@markless/host` seems to be the native layer and the task asks for the phone's own sheet look and motion. On the web, `drawer` from `@markless/ui` shows it. I branch on `platform` because nothing says what `host.sheet` does in a browser.

WhatsNew: `drawer` shows the panel on all three platforms. `host.sheet` takes no `class` or `style`, so it can't follow the designer's spec, and a native sheet would look different on each platform. `drawer.content` accepts `PropsOf<'div'>`, so the purple background, white text and 24px top corners apply everywhere.

Scan: `host.camera`, given the `Camera` from `camera()`, shows the live preview. It is the only preview element listed, and the Scan button calls `takePhoto()` on that same `Camera`.

Invoice: `host.pdf` shows the PDF. It is the only PDF viewer listed, and it takes `src` and tracks the current page.

B:
Orders: a website visitor sees the order list and a Filter button. The button opens a styled drawer that slides up from the bottom with All, Open and Shipped.

WhatsNew: a website visitor sees the same purple panel with rounded top corners sliding up when the page loads. "Got it" closes it.

Scan: I assume a website visitor sees a live webcam preview from the browser's camera access, plus a Scan button that uploads a photo.

Invoice: I assume a website visitor sees the PDF inside the page, probably in the browser's built-in PDF viewer.

Confidence: 3/5

## Guesses

- What `host.*` elements do on the web is never stated. I assumed `host.sheet` might not work there, so I fell back to `drawer`. I assumed `host.camera` and `host.pdf` do work there (browser camera access and the built-in PDF viewer), but the declarations don't confirm either.
- I guessed that `orientation="vertical"` makes the drawer slide in from the bottom.
- I guessed that `drawer.root` can be used without `drawer.trigger` and opens straight away when `open` starts as `true`.
- I guessed that native sheet content is passed as children with no further wrapping, and that `sizes={['half']}` gives a half-height sheet.
- I guessed that `host.camera` asks for camera permission itself, and that `takePhoto()` captures the frame shown in the preview.
- I guessed that a string `style` attribute is accepted, and that async event handlers are allowed.
- I guessed that a namespaced member such as `<drawer.root>` or `<host.sheet>` can be used directly as a JSX tag.

Tools used: none
