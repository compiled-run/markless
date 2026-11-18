```tsx
// file: Orders.tsrx
import { computed, state } from '@markless/core';
import { platform } from '@markless/device';
import { drawer } from '@markless/ui';
import { native } from '@markless/native';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let open = state(false);
	let filter = state<'All' | 'Open' | 'Shipped'>('All');
	const label = computed(() => `Filter: ${filter}`);

	<main>
		<button onClick={() => (open = true)}>{label}</button>
		<ul>
			@for (const order of orders; key order) {
				<li>{order}</li>
			}
		</ul>
		@if (platform === 'web') {
			<drawer.root open={open} onChange={(next) => (open = next)} orientation="vertical">
				<drawer.backdrop />
				<drawer.content>
					<drawer.title>Filter</drawer.title>
					<button onClick={() => { filter = 'All'; open = false; }}>All</button>
					<button onClick={() => { filter = 'Open'; open = false; }}>Open</button>
					<button onClick={() => { filter = 'Shipped'; open = false; }}>Shipped</button>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.root>
		} @else {
			<native.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
				<div>
					<button onClick={() => { filter = 'All'; open = false; }}>All</button>
					<button onClick={() => { filter = 'Open'; open = false; }}>Open</button>
					<button onClick={() => { filter = 'Shipped'; open = false; }}>Shipped</button>
				</div>
			</native.sheet>
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
		<drawer.content
			style="position: fixed; left: 0; right: 0; bottom: 0; background: #5b21b6; color: #ffffff; border-radius: 24px 24px 0 0; padding: 24px;"
		>
			<drawer.title>What's new</drawer.title>
			<drawer.close>Got it</drawer.close>
		</drawer.content>
	</drawer.root>
}
```

```tsx
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

```tsx
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

A: Orders uses `native.sheet` on iPhone and Android, because only the system's own sheet looks and moves exactly like the sheets in the phone's apps. On the website it uses `drawer`, because nothing says `native.sheet` works in a browser.

A: WhatsNew uses `drawer` from `@markless/ui` on every platform. It accepts `style` and `class`, so it can follow the designer's spec and look the same everywhere. `native.sheet` has no styling props and looks like each phone's system sheet, so it cannot match a custom design.

A: Scan uses `native.camera`, given the `Camera` handle from `camera()` in `@markless/device`. It is the only preview element in the declarations, and `takePhoto()` on that same handle supplies the Blob for `upload`.

A: Invoice uses `native.pdf` in the apps, for the system PDF viewer. On the website it uses a plain `<iframe>`, because the browser displays PDFs itself and nothing says `native.pdf` works on the web.

B: Orders: a website visitor sees the list and a Filter button that opens a sliding drawer with All, Open and Shipped, plus a backdrop and a Close button.

B: WhatsNew: a website visitor sees the same purple panel with white text and 24px rounded top corners sliding up from the bottom, closed with "Got it".

B: Scan: a website visitor sees a live camera preview, assuming `native.camera` uses the browser camera on the web, and a Scan button that uploads the photo.

B: Invoice: a website visitor sees the browser's built-in PDF viewer inside the page.

Confidence: 3/5

## Guesses

- Whether `native.*` elements render anything on `platform === 'web'`. Nothing in the declarations says they do, so I branched for the sheet and the PDF. For the camera I assumed they do, because there is no other preview element.
- That `camera()` and `takePhoto()` work in a browser, using the computer's camera.
- That family parts are written as JSX member tags (`<drawer.root>`, `<native.sheet>`).
- That `orientation="vertical"` makes the drawer slide in from the bottom. I also positioned the content with inline styles in case the drawer does not place itself.
- That `drawer.close` closes the drawer and reports it through `onChange`.
- What `native.sheet` accepts as children. I used plain buttons.
- That `sizes={['half']}` is a sensible size for the filter sheet.
- The orders have no status data, so the filter only records and shows the choice. It does not remove rows from the list.
- That `native.pdf` can load a relative URL like `/invoices/...` inside the apps.

Tools used: none
