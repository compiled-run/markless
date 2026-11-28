```tsrx
// file: Orders.tsrx
import { computed, state } from '@markless/core';
import { platform } from '@markless/device';
import { drawer } from '@markless/ui';
import { ios } from '@markless/ios';
import { android } from '@markless/android';

type Filter = 'All' | 'Open' | 'Shipped';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let filter = state<Filter>('All');
	let open = state(false);
	const label = computed(() => `Filter: ${filter}`);

	<section>
		<h1>Orders</h1>
		<p>{label}</p>
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
	</section>
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
import { state } from '@markless/core';
import { camera, platform } from '@markless/device';
import { ios } from '@markless/ios';
import { android } from '@markless/android';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();
	let stream = state<MediaStream | null>(null);
	let status = state('');
	let video: HTMLVideoElement | null = null;

	async function startWebCamera() {
		try {
			stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
		} catch {
			status = 'No camera available';
		}
	}

	async function webPhoto(): Promise<Blob> {
		const canvas = document.createElement('canvas');
		canvas.width = video!.videoWidth;
		canvas.height = video!.videoHeight;
		canvas.getContext('2d')!.drawImage(video!, 0, 0);
		return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/jpeg'));
	}

	async function scan() {
		status = 'Uploading…';
		const photo = platform === 'web' ? await webPhoto() : await cam.takePhoto();
		await upload(photo);
		status = 'Uploaded';
	}

	<main>
		<h1>Scan a receipt</h1>
		@if (platform === 'web') {
			<div>
				@if (stream === null) {
					<button onClick={startWebCamera}>Start camera</button>
				} @else {
					<video
						srcObject={stream}
						autoplay
						playsinline
						muted
						onLoadedMetadata={(event) => (video = event.currentTarget)}
					/>
				}
			</div>
		} @else {
			<>
				<ios.camera el={cam} facing="back" />
				<android.camera el={cam} facing="back" />
			</>
		}
		<button onClick={scan}>Scan</button>
		<p>{status}</p>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { ios } from '@markless/ios';
import { android } from '@markless/android';

export default function Invoice({ id }: { id: string }) @{
	let page = state(1);

	<section>
		<h1>Invoice {id}</h1>
		@if (platform === 'web') {
			<iframe src={`/invoices/${id}.pdf`} title={`Invoice ${id}`} style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<>
				<ios.pdf src={`/invoices/${id}.pdf`} page={page} onPageChange={(next) => (page = next)} />
				<android.pdf src={`/invoices/${id}.pdf`} page={page} onPageChange={(next) => (page = next)} />
			</>
		}
	</section>
}
```

## Answers

A: Orders uses `ios.sheet` and `android.sheet` in the phone apps, because only the platform's own sheet looks and moves exactly like the sheets in the phone's apps. On the website it uses `drawer` from `@markless/ui`, because `ios.sheet` and `android.sheet` don't render there. WhatsNew uses `drawer` on every platform, because the design is custom and must look identical everywhere, and native sheets can't take custom styling (no `style`/`class` props). Scan uses `ios.camera` and `android.camera` (with the `Camera` from `camera()`) in the apps. On the website it uses a plain `<video>` fed by `getUserMedia`, because no web camera element is declared. Invoice uses `ios.pdf` and `android.pdf` in the apps and an `<iframe>` on the website, because the native PDF elements only exist in the app builds.

B: Orders: the order list, then a Filter button that opens a drawer with All, Open and Shipped. WhatsNew: the same purple panel with rounded top corners, open on load, which "Got it" closes. Scan: a "Start camera" button, then a live `<video>` preview, and a Scan button that grabs a frame and uploads it. If there is no camera, the page says "No camera available". Invoice: the PDF shown by the browser inside an iframe.

Confidence: 3/5

## Guesses

How to write a member-expression tag (`<ios.sheet>`, `<drawer.root>`) in `.tsrx`.

Whether the `ios`/`android` elements render nothing on web. I assumed so and branched on `platform` for the website fallback.

Whether `drawer`'s `orientation="vertical"` means it slides up from the bottom.

Whether `style` as a string and `srcObject` as a prop are accepted on DOM elements.

Whether a plain mutable `let video` that isn't `state` is allowed, and capturing the element with `onLoadedMetadata`.

Whether `camera()` can be called on web without throwing. I only call `takePhoto` in the apps.

Whether async `@if` conditions inside `@for`/fragments are fine.

The size choice `'half'` for the filter sheet.

Whether `drawer.trigger` works as a toggle when `open` is controlled.

Tools used: none
