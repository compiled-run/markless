```tsrx
// file: Orders.tsrx
import { state, computed } from '@markless/core';
import { platform } from '@markless/device';
import { builtin } from '@markless/builtin';
import { drawer } from '@markless/ui';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let filter = state('All');
	let open = state(false);
	const native = platform !== 'web';

	<main>
		<button onClick={() => (open = true)}>Filter: {filter}</button>
		<ul>
			@for (const order of orders; key order) {
				<li>{order}</li>
			}
		</ul>
		@if (native) {
			<builtin.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
				<div>
					<button onClick={() => { filter = 'All'; open = false; }}>All</button>
					<button onClick={() => { filter = 'Open'; open = false; }}>Open</button>
					<button onClick={() => { filter = 'Shipped'; open = false; }}>Shipped</button>
				</div>
			</builtin.sheet>
		} @else {
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
import { platform } from '@markless/device';
import { builtin } from '@markless/builtin';

export default function Invoice({ id }: { id: string }) @{
	const src = `/invoices/${id}.pdf`;

	<section>
		@if (platform !== 'web') {
			<builtin.pdf src={src} />
		} @else {
			<iframe src={src} title={`Invoice ${id}`} style="width: 100%; height: 80vh; border: 0;" />
		}
	</section>
}
```

## Answers

A:
- **Orders:** On iPhone and Android the sheet is `builtin.sheet`, because it is the phone's own sheet and so looks and moves like the sheets in its apps. On the website it is `drawer`, because I can't tell whether `builtin.sheet` renders anything in a browser.
- **WhatsNew:** The panel is `drawer` on every platform. It is drawn by our own code, so our styling applies and the panel looks the same everywhere. A native sheet would follow each phone's own look instead of the designer's spec.
- **Scan:** The preview is `builtin.camera` fed by `camera()`. The camera API offers nothing else that shows a live preview.
- **Invoice:** On the phones the PDF is shown by `builtin.pdf`, the phone's own PDF viewer. On the website it is an `<iframe>`, which uses the browser's own PDF viewer.

B:
- **Orders:** A Filter button. It opens a drawer that slides up from the bottom over a backdrop and holds All, Open, Shipped and Close.
- **WhatsNew:** The same purple panel with rounded top corners. It slides up when the page opens and "Got it" closes it.
- **Scan:** A live preview from the computer's camera (I assume via the browser's camera access) and a Scan button that uploads the photo.
- **Invoice:** The PDF shown inline in the browser's viewer.

Confidence: 3/5

## Guesses

- **What `builtin.*` does on the website:** I couldn't tell whether it renders a fallback, renders nothing or throws. So Orders and Invoice switch to other elements when `platform` is `'web'`, and Scan assumes `builtin.camera` works in a browser.
- **How the parts are written:** I assumed `builtin` and `drawer` parts are used as tags with a dot, like `<builtin.sheet>` and `<drawer.content>`.
- **Drawer direction:** I assumed `orientation="vertical"` makes the drawer slide up from the bottom.
- **Drawer styling:** I assumed the purple colour, white text and corners can be set on `drawer.content` with a `style` string.
- **Close button:** I assumed `drawer.close` closes the drawer and reports it through `onChange`.
- **Sheet height:** I picked `sizes={['half']}` for the filter sheet.
- **Async click handler:** I assumed a click handler may be `async`.
- **Unused import:** The `computed` import in Orders.tsrx is not used, and the filter is not applied to the list. Nothing in the task asked for the filtering itself.

Tools used: none
