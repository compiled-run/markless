```tsrx
// file: Orders.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { builtin } from '@markless/builtin';
import { drawer } from '@markless/ui';

function Choices({ onPick }: { onPick: (choice: string) => void }) @{
	<div>
		<button onClick={() => onPick('All')}>All</button>
		<button onClick={() => onPick('Open')}>Open</button>
		<button onClick={() => onPick('Shipped')}>Shipped</button>
	</div>
}

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
					<Choices onPick={(choice) => { filter = choice; open = false; }} />
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.root>
		} @else {
			<>
				<button onClick={() => (open = true)}>Filter</button>
				<builtin.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<Choices onPick={(choice) => { filter = choice; open = false; }} />
				</builtin.sheet>
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
import { builtin } from '@markless/builtin';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();

	<main>
		<builtin.camera el={cam} facing="back" />
		<button onClick={async () => upload(await cam.takePhoto())}>Scan</button>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { builtin } from '@markless/builtin';

export default function Invoice({ id }: { id: string }) @{
	<main>
		<builtin.pdf src={`/invoices/${id}.pdf`} />
	</main>
}
```

## Answers

A: Orders uses `builtin.sheet` on iPhone and Android, because it is the only sheet that is described as the platform's own sheet, so it should look and move like the system's sheets. On the website it uses `drawer` from `@markless/ui`, branching on `platform === 'web'`, because I can't tell whether `builtin.sheet` works on the web. WhatsNew uses `drawer` everywhere, because it takes `class` and `style` (through `PropsOf<'div'>`), so the designer's spec can be drawn the same on all three targets. A native sheet would follow each operating system's look instead. Scan uses `builtin.camera` with `el={camera()}`, because it is the only live preview element, and the same `Camera` object provides `takePhoto()`. Invoice uses `builtin.pdf`, because it is the only element that shows a PDF.

B: Orders: the Filter button opens a drawer that slides up from the bottom, with a title, the three choices and a Close button. WhatsNew: the same purple panel as in the apps, open when the page loads, closed by "Got it". Scan: a live preview from the computer's webcam (I'm assuming the browser asks for camera permission first) and a Scan button that uploads the photo. Invoice: the PDF shown inside the page, probably through the browser's own PDF viewer.

Confidence: 3/5

## Guesses

- Whether `builtin.sheet` has a web fallback. I branched on `platform` to avoid relying on one.
- That `builtin.camera` and `camera()` work in a desktop browser through the webcam.
- That `builtin.pdf` renders in the browser.
- That `orientation="vertical"` on `drawer.root` makes the drawer slide up from the bottom. Nothing says which edge it opens from.
- That `drawer.close` and `drawer.trigger` change `open` through `onChange` without any extra code.
- That `style` takes a string.
- That `sizes={['half']}` is a sensible size for a three-option sheet.
- The orders have no status data, so choosing a filter only changes the "Filter:" label and does not narrow the list.

Tools used: none
