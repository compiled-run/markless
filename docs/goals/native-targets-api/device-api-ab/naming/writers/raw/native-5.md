```tsrx
// file: Orders.tsrx
import { computed, state } from '@markless/core';
import { platform } from '@markless/device';
import { native } from '@markless/native';
import { drawer } from '@markless/ui';

const orders = ['A-1', 'A-2', 'A-3'];
const statusOf: Record<string, 'Open' | 'Shipped'> = { 'A-1': 'Open', 'A-2': 'Shipped', 'A-3': 'Open' };
const choices = ['All', 'Open', 'Shipped'] as const;

export default function Orders() @{
	let filter = state<'All' | 'Open' | 'Shipped'>('All');
	let open = state(false);
	const shown = computed(() => orders.filter((id) => filter === 'All' || statusOf[id] === filter));

	<main>
		<ul>
			@for (const id of shown; key id) {
				<li>{id}</li>
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
		<drawer.content
			style="background: #5b21b6; color: #ffffff; border-radius: 24px 24px 0 0; position: fixed; left: 0; right: 0; bottom: 0;"
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
		<native.camera el={cam} facing="back" />
		<button onClick={async () => upload(await cam.takePhoto())}>Scan</button>
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
			<iframe src={`/invoices/${id}.pdf`} title={`Invoice ${id}`} style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<native.pdf src={`/invoices/${id}.pdf`} />
		}
	</section>
}
```

## Answers

A:
- Orders: on iPhone and Android, `native.sheet` shows the filter sheet. It is the only option that can be the phone's own sheet, so it looks and moves like sheets in the system apps. On the web, `drawer` shows it, because nothing published says `native.sheet` works in a browser.
- WhatsNew: `drawer.content` shows the panel. It accepts `style` and `class`, so it can match the designer's spec exactly. It also renders the same markup on all three platforms. `native.sheet` takes no `style` or `class`, and it would look different on iPhone and Android.
- Scan: `native.camera`, given the `Camera` from `camera()`, shows the preview. It is the only published live-preview element, and `takePhoto()` on that same `Camera` gives the `Blob` for `upload`.
- Invoice: on iPhone and Android, `native.pdf` shows the PDF. On the web, an `<iframe>` shows it, because browsers show PDFs inline on their own.

B:
- Orders: a Filter button that opens a drawer from the bottom with All, Open and Shipped, plus a Close button. The list filters the same way it does in the apps.
- WhatsNew: the same purple panel with white text and rounded top corners, open when the page loads. "Got it" closes it.
- Scan: a live preview from the computer's camera and a Scan button that uploads the photo. This assumes `native.camera` and `camera()` work in the browser.
- Invoice: the PDF inside the page, shown by the browser's own PDF viewer in an iframe.

Confidence: 3/5

## Guesses

- Whether `native.*` elements render on the web at all. I assumed `native.sheet` and `native.pdf` do not, and gave them web fallbacks. For the camera, I assumed `native.camera` does work on the web, because no other preview API is published. That makes the two choices inconsistent.
- Parts are written as member-expression tags (`<drawer.root>`, `<native.sheet>`), and `style` accepts a string.
- `drawer` with `orientation="vertical"` slides up from the bottom. I also added fixed bottom positioning myself.
- Leaving out `drawer.trigger` and starting with `open = true` shows the panel on load.
- `native.sheet` children can be plain buttons, and `sizes={['half']}` gives a half-height sheet.
- The orders have no status data, so I made up a status for each one (A-1 and A-3 Open, A-2 Shipped).
- `native.pdf` can load a relative URL like `/invoices/${id}.pdf`.
- An async handler that ignores the `upload` result is acceptable, and `upload` reports its own errors.

Tools used: none
