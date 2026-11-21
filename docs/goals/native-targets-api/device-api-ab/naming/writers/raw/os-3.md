```tsrx
// file: Orders.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { os } from '@markless/os';
import { drawer } from '@markless/ui';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let filter = state<'All' | 'Open' | 'Shipped'>('All');
	let open = state(false);

	<main>
		<p>{'Filter: '}{filter}</p>
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
				<os.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<>
						<button onClick={() => { filter = 'All'; open = false; }}>All</button>
						<button onClick={() => { filter = 'Open'; open = false; }}>Open</button>
						<button onClick={() => { filter = 'Shipped'; open = false; }}>Shipped</button>
					</>
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
	const src = `/invoices/${id}.pdf`;

	<section>
		@if (platform === 'web') {
			<iframe src={src} title={`Invoice ${id}`} style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<os.pdf src={src} />
		}
	</section>
}
```

## Answers

A: Orders.tsrx uses `os.sheet` in the iPhone and Android apps. The task says it must look and move exactly like the phone's own sheets, and `@markless/os` reads as the package for the platform's own built-in controls. On the website it uses `drawer` from `@markless/ui`, because nothing says `os.sheet` renders on the web.

A: WhatsNew.tsrx uses `drawer` everywhere. The panel follows a custom designer spec that must be identical on all three platforms. `drawer` takes `PropsOf<'div'>`, so it accepts `style`. `os.sheet` takes no `style` or `class` and would look like each platform's own sheet.

A: Scan.tsrx uses `os.camera` with `el={camera()}`. It is the only preview element in the packages, and its `el` prop takes the `Camera` from `@markless/device`. The Scan button calls `takePhoto()` on that same object.

A: Invoice.tsrx uses `os.pdf` in the apps, because it is the only PDF viewer element. On the website it uses an `<iframe>`, because browsers show PDFs on their own and nothing says `os.pdf` works there.

B: Orders: a website visitor sees a Filter button that opens a drawer from the bottom with All, Open and Shipped buttons and a Close button. The list stays the same and only the "Filter:" label changes, because the orders have no status data.

B: WhatsNew: a website visitor sees the same purple panel with rounded top corners sliding up when the page opens. "Got it" closes it.

B: Scan: a website visitor with a camera sees a live preview (assumed to come from the browser camera) and a Scan button that uploads the photo.

B: Invoice: a website visitor sees the PDF in an embedded frame.

Confidence: 2/5

## Guesses

- I assumed namespace parts are written as JSX member tags (`<drawer.root>`, `<os.sheet>`).
- I assumed `os.sheet` does not work on the website (no fallback or error is documented), so I branched on `platform`.
- I assumed `os.camera` and `camera()` work on the web through the browser camera. Nothing says this either way.
- I assumed `os.pdf` might not work on the web, so I used an `<iframe>` there.
- I assumed `orientation="vertical"` makes the drawer slide up from the bottom.
- I assumed `style` takes a string.
- I assumed a multi-statement block arrow in `onClick` is allowed.
- I assumed `os.sheet` takes one child node, so I wrapped the buttons in `<>…</>`.
- I assumed `sizes={['half']}` suits a three-choice filter.
- Filtering does not hide any orders, because the orders are plain strings with no status. The filter only sets a label.
- I assumed the `os.sheet` close gesture reports through `onChange(false)`.

Tools used: none (apart from the single Read of the instruction file)
