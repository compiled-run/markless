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
		<p>Filter: {filter}</p>
		<ul>
			@for (const order of orders; key order) {
				<li>{order}</li>
			}
		</ul>
		@if (native) {
			<>
				<button onClick={() => (open = true)}>Filter</button>
				<builtin.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<builtin.menu label="Filter">
						<builtin.item label="All" onSelect={() => { filter = 'All'; open = false; }} />
						<builtin.item label="Open" onSelect={() => { filter = 'Open'; open = false; }} />
						<builtin.item label="Shipped" onSelect={() => { filter = 'Shipped'; open = false; }} />
					</builtin.menu>
				</builtin.sheet>
			</>
		} @else {
			<drawer.root open={open} onChange={(next) => (open = next)} orientation="vertical">
				<drawer.trigger>Filter</drawer.trigger>
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
		<drawer.content
			style="position: fixed; left: 0; right: 0; bottom: 0; background: #5b21b6; color: #fff; border-radius: 24px 24px 0 0; padding: 24px;"
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
import { builtin } from '@markless/builtin';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();

	<main>
		<h1>Scan a receipt</h1>
		<builtin.camera el={cam} facing="back" />
		<button onClick={async () => upload(await cam.takePhoto())}>Scan</button>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { builtin } from '@markless/builtin';

export default function Invoice({ id }: { id: string }) @{
	<section>
		<builtin.pdf src={`/invoices/${id}.pdf`} />
	</section>
}
```

## Answers

A: Orders uses `builtin.sheet` on iPhone and Android, because the sheet has to look and move exactly like the phone's own sheets, and `builtin` sounds like the platform's native control. On the website it uses `drawer` from `@markless/ui` instead, because I don't know what `builtin.sheet` does in a browser. WhatsNew uses `drawer.content` from `@markless/ui`, because the panel has to follow a custom design and look identical on all three targets. A native sheet would follow each platform's own look, so it can't meet that. Scan uses `builtin.camera` with the `Camera` from `camera()`, because its `el` prop takes that object, which makes it the live preview for the same camera that takes the photo. Invoice uses `builtin.pdf`, because it is the only PDF viewer in the packages.

B: Orders: website visitors see a Filter button that opens a styled drawer sliding up from the bottom, with All, Open and Shipped buttons. WhatsNew: they see the same purple panel with rounded top corners, already open when the page loads, and a "Got it" button that closes it. Scan: if their computer has a camera, they see a live preview from the browser camera and a Scan button that uploads the photo. Invoice: they see the PDF inside the page, through whatever web viewer `builtin.pdf` uses there.

Confidence: 3/5

## Guesses

- I assumed parts are written as `<drawer.root>` and `<builtin.sheet>` in templates.
- I didn't know whether `builtin.sheet` works on the web, so I switched to `drawer` there based on `platform`.
- I assumed `builtin.camera` and `builtin.pdf` work in browsers (camera through the browser's camera access), because nothing says they don't.
- I didn't know how to make the drawer slide up from the bottom, so I used `orientation="vertical"` plus fixed positioning in its style.
- I assumed `drawer.close` and the backdrop close the drawer and call `onChange(false)`.
- I assumed `builtin.menu` and `builtin.item` work inside a sheet as the list of filter choices.
- I left out `computed` filtering because the orders have no status, so the chosen filter is only displayed.
- I assumed `camera()` can be called in the component body and `takePhoto()` can be called from a click handler.

Tools used: none
