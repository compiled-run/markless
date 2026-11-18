```tsrx
// file: Orders.tsrx
import { computed, state } from '@markless/core';
import { platform } from '@markless/device';
import { builtin } from '@markless/builtin';
import { drawer } from '@markless/ui';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let open = state(false);
	let filter = state<'All' | 'Open' | 'Shipped'>('All');
	const choose = (value: 'All' | 'Open' | 'Shipped') => {
		filter = value;
		open = false;
	};

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
					<drawer.title>Filter</drawer.title>
					<button onClick={() => choose('All')}>All</button>
					<button onClick={() => choose('Open')}>Open</button>
					<button onClick={() => choose('Shipped')}>Shipped</button>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.root>
		} @else {
			<>
				<button onClick={() => (open = true)}>Filter</button>
				<builtin.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<div>
						<button onClick={() => choose('All')}>All</button>
						<button onClick={() => choose('Open')}>Open</button>
						<button onClick={() => choose('Shipped')}>Shipped</button>
					</div>
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
		<drawer.content
			style="background: #5b21b6; color: #ffffff; border-top-left-radius: 24px; border-top-right-radius: 24px; position: fixed; left: 0; right: 0; bottom: 0;"
		>
			<drawer.title>What's new</drawer.title>
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
	const scan = async () => {
		const photo = await cam.takePhoto();
		await upload(photo);
	};

	<main>
		<builtin.camera el={cam} facing="back" />
		<button onClick={scan}>Scan</button>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { state } from '@markless/core';
import { builtin } from '@markless/builtin';

export default function Invoice({ id }: { id: string }) @{
	let page = state(1);

	<section>
		<builtin.pdf src={`/invoices/${id}.pdf`} page={page} onPageChange={(next) => (page = next)} />
	</section>
}
```

## Answers

A:
Orders: on iPhone and Android, `builtin.sheet` shows the sheet. It is the only element that can look and move like the phone's own sheets, because it appears to render the operating system's own sheet. On the website, `drawer` from `@markless/ui` shows it, because I could not tell whether `builtin.sheet` works in a browser.

WhatsNew: `drawer` shows the panel. Its parts take every `<div>` attribute, including `style` and `class`, so the designer's colour and corners can be applied and will look the same everywhere. `builtin.sheet` takes no styling props, and a native sheet would look different on each platform.

Scan: `builtin.camera` shows the live preview, fed by `camera()` from `@markless/device`. `takePhoto()` gives the Blob that gets passed to `upload`.

Invoice: `builtin.pdf` shows the PDF inside the page. It is the only element given that renders a PDF.

B:
Orders: a website visitor sees the list and a Filter button. The button opens a drawer from `@markless/ui` with All, Open and Shipped, plus a backdrop and a Close button.

WhatsNew: a website visitor sees the same purple panel with white text and 24px rounded top corners. It is open when the page loads, and "Got it" closes it.

Scan: a website visitor sees a live preview from their computer's webcam and a Scan button. This assumes `builtin.camera` and `camera()` work in browsers.

Invoice: a website visitor sees the PDF embedded in the page. This assumes `builtin.pdf` has a web implementation.

Confidence: 3/5

## Guesses

- Whether `builtin.*` elements render on the website at all. Nothing in the declarations says so. I branched on `platform` only for the sheet, and assumed camera and pdf work on the web.
- That namespace members are written as tags like `<drawer.root>` and `<builtin.sheet>`.
- That `orientation="vertical"` makes the drawer slide up from the bottom, and that `drawer.content` accepts a `style` string with its positioning left to me.
- That `drawer.root` with `open` set to true on the first render opens the panel as the page loads, and that `drawer.close` updates the open state through `onChange`.
- That `sizes={['half']}` gives a sensible native filter-sheet height.
- That `camera()` can be called in the component body and that `builtin.camera` asks for camera permission and starts the preview itself.
- That `@if`/`@else` on the module constant `platform` is acceptable, and that `builtin.sheet` with only `open`/`onChange` needs no separate trigger element.

Tools used: none
