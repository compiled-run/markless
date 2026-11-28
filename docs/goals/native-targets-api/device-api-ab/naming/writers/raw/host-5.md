```tsrx
// file: Orders.tsrx
import { computed, state } from '@markless/core';
import { platform } from '@markless/device';
import { drawer } from '@markless/ui';
import { host } from '@markless/host';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let filter = state<'All' | 'Open' | 'Shipped'>('All');
	let open = state(false);
	const choices = ['All', 'Open', 'Shipped'] as const;

	<main>
		<h1>Orders ({filter})</h1>
		<ul>
			@for (const order of orders; key order) {
				<li>{order}</li>
			}
		</ul>
		@if (platform === 'web') {
			<drawer.root open={open} onChange={(next) => (open = next)}>
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
					<>
						@for (const choice of choices; key choice) {
							<button onClick={() => { filter = choice; open = false; }}>{choice}</button>
						}
					</>
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
import { platform } from '@markless/device';
import { host } from '@markless/host';

export default function Invoice({ id }: { id: string }) @{
	const src = `/invoices/${id}.pdf`;

	<section>
		@if (platform === 'web') {
			<iframe src={src} title={`Invoice ${id}`} style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<host.pdf src={src} />
		}
	</section>
}
```

## Answers

A:
- **Orders:** On iPhone and Android, `host.sheet` shows the sheet. The task asks for the phone's own sheet look and motion, and `host.sheet` appears to be the system sheet. On the website, `drawer` from `@markless/ui` shows it, because nothing says `host.sheet` exists in a browser.
- **WhatsNew:** `drawer` shows the panel. It takes `class`/`style` through `PropsOf<'div'>`, so the designer's purple background and rounded corners apply the same way on all three platforms. `host.sheet` takes no style props and would look different on each platform.
- **Scan:** `host.camera` shows the preview, fed by `camera()` from `@markless/device`. It is the only live-preview element declared.
- **Invoice:** On phones, `host.pdf` shows the PDF. On the website, an `<iframe>` does, using the browser's built-in PDF viewer.

B:
- **Orders:** A Filter button that opens a sliding drawer with All, Open, Shipped and Close.
- **WhatsNew:** The same purple panel with white text, rising from the bottom on page load, closed by "Got it".
- **Scan:** A live camera preview and a Scan button, assuming `host.camera` renders in the browser.
- **Invoice:** The PDF embedded in the page through the browser's viewer.

Confidence: 2/5

## Guesses

Platform support: I guessed whether `host.*` elements render on the website at all. I assumed `host.sheet` and `host.pdf` do not, and that `host.camera` does. That makes Scan the shakiest answer.

Sheet contents: I assumed `host.sheet` accepts ordinary `<button>` children and renders them inside the system sheet.

Drawer usage: I assumed `drawer` parts are used as `<drawer.root>`-style member tags. I also assumed `orientation="vertical"` makes it slide from the bottom, and that `drawer.close` and `drawer.trigger` toggle `open` through `onChange`.

Opening on load: I assumed `state(true)` on the drawer's `open` makes it slide up when the page opens.

Scan handler: I assumed an async inline handler is allowed, and that `camera()` should be called once in the component body.

Platform check: I assumed comparing `platform` to `'web'` in an `@if` is the right way to switch by platform.

Tools used: none
