```tsrx
// file: Orders.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { drawer } from '@markless/ui';
import { ios } from '@markless/ios';
import { android } from '@markless/android';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let open = state(false);
	let filter = state('All');

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
		<drawer.content style="background: #5b21b6; color: white; border-radius: 24px 24px 0 0;">
			<drawer.title>What's new</drawer.title>
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
		<h1>Scan a receipt</h1>
		@if (platform === 'web') {
			<p>Your browser will ask to use your camera when you press Scan.</p>
		} @else {
			<>
				<ios.camera el={cam} facing="back" />
				<android.camera el={cam} facing="back" />
			</>
		}
		<button onClick={async () => await upload(await cam.takePhoto())}>Scan</button>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { platform } from '@markless/device';
import { ios } from '@markless/ios';
import { android } from '@markless/android';

export default function Invoice({ id }: { id: string }) @{
	<section>
		@if (platform === 'web') {
			<iframe src={`/invoices/${id}.pdf`} title="Invoice" style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<>
				<ios.pdf src={`/invoices/${id}.pdf`} />
				<android.pdf src={`/invoices/${id}.pdf`} />
			</>
		}
	</section>
}
```

## Answers

A: Orders uses `ios.sheet` and `android.sheet` in the apps, because the task asks for the phone's own system sheet and only those elements can give it. The website uses `drawer` from `@markless/ui`. WhatsNew uses `drawer` on all three platforms, because the designer's look (purple background, white text, 24px rounded top corners) has to be identical everywhere. The native sheets take no `class` or `style`, so they can't be styled; `drawer` takes all `div` attributes. Scan uses `ios.camera` and `android.camera` with the `el` from `camera()` for the live preview in the apps, and `cam.takePhoto()` for the photo. Invoice uses `ios.pdf` and `android.pdf` in the apps, and a plain `<iframe>` on the website, because browsers show PDFs on their own.

B: Orders: a website visitor sees the list and a Filter button that opens a web drawer with All, Open and Shipped. WhatsNew: the same purple panel slides up on page open, and "Got it" closes it. Scan: a website visitor sees a short note and the Scan button, with no live preview. The browser asks for camera permission and takes the photo, and the photo is uploaded. Invoice: the PDF shows in an inline iframe.

Confidence: 3/5

## Guesses

- I guessed that `ios.*` and `android.*` elements render nothing on the website. That's why I gate the web fallback with `platform === 'web'`.
- I guessed that `camera().takePhoto()` works in a browser. Nothing published gives the website a live camera preview element, so website visitors get no preview.
- I guessed that `orientation="vertical"` on `drawer.root` makes the panel slide from the bottom. I also guessed that `drawer` without a trigger can start open with `open={true}`.
- I guessed that the native sheets close themselves through `onChange` and need no explicit close part.
- I guessed that `sizes={['half']}` is a sensible size for the filter sheet.
- I guessed that native `pdf` accepts a relative URL path.
- I guessed that a multi-statement arrow handler is allowed in `.tsrx`.

Tools used: none
