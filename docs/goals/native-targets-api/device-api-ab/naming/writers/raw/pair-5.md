```tsrx
// file: Orders.tsrx
import { computed, state } from '@markless/core';
import { platform } from '@markless/device';
import { drawer } from '@markless/ui';
import { ios } from '@markless/ios';
import { android } from '@markless/android';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let open = state(false);
	let filter = state<'All' | 'Open' | 'Shipped'>('All');
	const shown = computed(() => orders);

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
import { platform, camera } from '@markless/device';
import { ios } from '@markless/ios';
import { android } from '@markless/android';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();

	<main>
		<h1>Scan a receipt</h1>
		@if (platform === 'web') {
			<p>Your computer's camera will be used when you press Scan.</p>
		} @else {
			<>
				<ios.camera el={cam} facing="back" />
				<android.camera el={cam} facing="back" />
			</>
		}
		<button onClick={async () => upload(await cam.takePhoto())}>Scan</button>
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

A: Orders uses `ios.sheet` and `android.sheet` in the apps, because those are the phone's own sheets and the task says it must look and move exactly like the system ones. On the website it uses `drawer` from `@markless/ui`, because no native sheet exists there. WhatsNew uses `drawer` on every platform, because the designer's purple, rounded look has to be identical everywhere and the native sheets take no styling props. Scan uses `ios.camera` and `android.camera` for the preview in the apps, because those are the only preview elements declared. Invoice uses `ios.pdf` and `android.pdf` in the apps, and a plain `<iframe>` on the website, because the browser can show a PDF itself.

B: In Orders, a website visitor sees a Filter button that opens a `drawer` with All, Open and Shipped. In WhatsNew, they see the same purple panel as the apps, with a "Got it" button. In Scan, they see a message and a Scan button that uses `camera().takePhoto()` (presumably the browser's camera prompt), but no live preview. In Invoice, they see the PDF in an iframe inside the page.

Confidence: 2/5

## Guesses

Whether `ios.*`/`android.*` elements render nothing on the website: I assumed they do, so I gated with `platform === 'web'` and added a web fallback.

Whether I needed to branch on `platform` between iOS and Android at all: the note says write both side by side and each build picks its own, so I didn't branch there.

Whether `drawer` slides from the bottom with `orientation="vertical"`, and whether it renders in the iPhone and Android apps (for example inside a web view).

Whether `drawer.content` accepts `style` as a string: `PropsOf<'div'>` says it takes `style`, but the exact form is a guess.

Whether `camera().takePhoto()` works in a desktop browser: no web camera preview element is published, so the website live preview is not met. A `<video>` fed by `getUserMedia` would need DOM or lifecycle access that the guidance doesn't show.

Whether the PDF elements accept a relative URL, and whether an `<iframe>` is acceptable on the web.

Whether the PDF elements need a `page` value: I left it out because `page` is optional.

Whether namespaced elements are written as `<ios.sheet>` in JSX.

Whether multi-statement arrow handlers are allowed.

Whether `@for` over a `computed` of a constant array is fine. I didn't apply the filter to the list because the order statuses are unknown.

Tools used: none
