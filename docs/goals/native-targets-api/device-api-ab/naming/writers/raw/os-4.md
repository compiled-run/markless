```tsrx
// file: Orders.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { os } from '@markless/os';
import { drawer } from '@markless/ui';

type Filter = 'All' | 'Open' | 'Shipped';

function FilterChoices({ current, onPick }: { current: Filter; onPick: (choice: Filter) => void }) @{
	const choices: Filter[] = ['All', 'Open', 'Shipped'];
	<div role="radiogroup" aria-label="Filter orders">
		@for (const choice of choices; key choice) {
			<button role="radio" aria-checked={current === choice} onClick={() => onPick(choice)}>
				{choice}
			</button>
		}
	</div>
}

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let filter = state<Filter>('All');
	let open = state(false);

	<main>
		<button onClick={() => (open = true)}>Filter</button>
		<p>Showing: {filter}</p>
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
					<FilterChoices
						current={filter}
						onPick={(choice) => {
							filter = choice;
							open = false;
						}}
					/>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.root>
		} @else {
			<os.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
				<FilterChoices
					current={filter}
					onPick={(choice) => {
						filter = choice;
						open = false;
					}}
				/>
			</os.sheet>
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
			style="position: fixed; left: 0; right: 0; bottom: 0; background: #5b21b6; color: #ffffff; border-radius: 24px 24px 0 0; padding: 24px;"
		>
			<drawer.title>What's new</drawer.title>
			<p>Here is what changed in this release.</p>
			<drawer.close style="color: #ffffff;">Got it</drawer.close>
		</drawer.content>
	</drawer.root>
}
```

```tsrx
// file: Scan.tsrx
import { state } from '@markless/core';
import { camera } from '@markless/device';
import { os } from '@markless/os';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();
	let busy = state(false);

	<main>
		<h1>Scan a receipt</h1>
		<os.camera el={cam} facing="back" />
		<button
			disabled={busy}
			onClick={async () => {
				busy = true;
				const photo = await cam.takePhoto();
				await upload(photo);
				busy = false;
			}}
		>
			Scan
		</button>
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
			<iframe src={`/invoices/${id}.pdf`} title={`Invoice ${id}`} style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<os.pdf src={`/invoices/${id}.pdf`} />
		}
	</section>
}
```

## Answers

A: Orders uses `os.sheet` on iPhone and Android because it is the phone's own sheet, so it looks and moves exactly like the sheets in the system apps. On the website it uses `drawer` from `@markless/ui`, because nothing says `os.sheet` works in a browser. WhatsNew uses `drawer` on every platform because the designer's spec has to look identical everywhere, and a native sheet would follow each OS's style instead. Its look comes from styling `drawer.content`. Scan uses `os.camera` with `el={camera()}`, because that is the only live preview element available, and the Scan button calls `takePhoto()` on the same `Camera` object. Invoice uses `os.pdf` in the apps and an `<iframe>` on the web, where the browser's built-in PDF viewer shows the file inside the page.

B: Orders: a website visitor sees the order list and a Filter button that opens a styled bottom drawer with All, Open and Shipped. Picking one sets the filter and closes the drawer. WhatsNew: the visitor sees the same purple panel with white text and 24px rounded top corners, already open, and "Got it" closes it. Scan: if the browser lets the page use the camera, the visitor sees a live preview and Scan uploads a photo. Invoice: the visitor sees the PDF in the browser's own viewer inside the page.

Confidence: 2/5

## Guesses

- Whether `os.sheet`, `os.camera` and `os.pdf` render on the web at all, or what they show there. None of this is documented. I branched on `platform` for the sheet and the PDF, and assumed `os.camera` works in a browser through the browser's camera access.
- That a member-expression tag like `<os.sheet>` or `<drawer.root>` is valid `.tsrx` syntax.
- That `drawer.root` with `orientation="vertical"` slides up from the bottom. The type does not say which edge it comes from, so I also pinned the content to the bottom with fixed positioning.
- That a `drawer` with `open` starting as `true` animates in when the page opens.
- That `drawer.close` closes the drawer by calling `onChange(false)`.
- That `sizes={['half']}` is a sensible size for the filter sheet.
- That `os.camera` previews the same `Camera` object that `camera()` returned, so `takePhoto()` captures what the preview shows.
- Orders carry no status, so choosing a filter is recorded and shown but cannot actually remove orders from the list.
- That `aria-checked` takes a boolean and that `style` takes a string.

Tools used: none
