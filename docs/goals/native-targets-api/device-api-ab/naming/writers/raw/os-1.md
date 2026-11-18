```tsrx
// file: Orders.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { drawer } from '@markless/ui';
import { os } from '@markless/os';

type Filter = 'All' | 'Open' | 'Shipped';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	const choices: readonly Filter[] = ['All', 'Open', 'Shipped'];
	let filter = state<Filter>('All');
	let open = state(false);

	<main>
		<p>Showing: {filter}</p>
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
import { os } from '@markless/os';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();

	<main>
		<os.camera el={cam} facing="back" />
		<button onClick={async () => upload(await cam.takePhoto())}>Scan</button>
	</main>
}
```

```tsrx
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
Orders: `os.sheet` on iPhone and Android, because it is the only sheet that uses the phone's own sheet and so looks and moves like it. On the website it uses the `drawer` family, because nothing says `os.sheet` works in a browser.

WhatsNew: the `drawer` family on all three platforms. It accepts `class` and `style`, so it can follow the designer's spec and look the same everywhere. `os.sheet` takes no style props and would look different on each platform.

Scan: `os.camera` with the `Camera` from `camera()`. It is the only live-preview element, and `takePhoto()` on that same object takes the photo.

Invoice: `os.pdf` on iPhone and Android. On the website it uses an `<iframe>`, so the browser's own PDF viewer shows the file inside the page.

B:
Orders: the list and a Filter button that opens a bottom drawer with All, Open, Shipped and Close buttons.

WhatsNew: the same purple panel with rounded top corners as in the apps, open when the page loads and closed by "Got it".

Scan: a live camera preview and a Scan button, assuming `os.camera` and `camera()` work in a browser.

Invoice: the PDF in an iframe, shown by the browser's viewer.

Confidence: 3/5

## Guesses

The parts are used as member-expression tags (`<drawer.root>`, `<os.sheet>`), and `os.sheet` children are ordinary markup.

`os.sheet` may not work on the website, so I added a fallback. It might in fact render something there.

`os.camera` and `camera()` work in a browser through the computer's webcam. Nothing in the types confirms this.

`os.pdf` may not work on the website, so I used an iframe there. I also guessed that a relative `src` resolves on native.

`style` takes a CSS string, `drawer.content` shows as a panel from the bottom when `orientation="vertical"`, and `drawer.close` closes the root it belongs to.

The orders have no status data, so the filter only records and shows the chosen value. It does not hide any rows.

Only one size, `'half'`, is passed to the native sheet.

Tools used: none
