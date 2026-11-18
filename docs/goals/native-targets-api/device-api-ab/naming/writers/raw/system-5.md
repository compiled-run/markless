```tsrx
// file: Orders.tsrx
import { state, computed } from '@markless/core';
import { platform } from '@markless/device';
import { system } from '@markless/system';
import { drawer } from '@markless/ui';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	const choices = ['All', 'Open', 'Shipped'];
	let open = state(false);
	let filter = state('All');
	const native = computed(() => platform !== 'web');

	<main>
		<button onClick={() => (open = true)}>Filter: {filter}</button>
		<ul>
			@for (const order of orders; key order) {
				<li>{order}</li>
			}
		</ul>
		@if (native) {
			<system.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
				<ul>
					@for (const choice of choices; key choice) {
						<li>
							<button onClick={() => { filter = choice; open = false; }}>{choice}</button>
						</li>
					}
				</ul>
			</system.sheet>
		} @else {
			<drawer.root open={open} onChange={(next) => (open = next)} orientation="vertical">
				<drawer.backdrop />
				<drawer.content>
					<drawer.title>Filter</drawer.title>
					<ul>
						@for (const choice of choices; key choice) {
							<li>
								<button onClick={() => { filter = choice; open = false; }}>{choice}</button>
							</li>
						}
					</ul>
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
		<drawer.content style="background: #5b21b6; color: #ffffff; border-radius: 24px 24px 0 0; padding: 24px;">
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
import { system } from '@markless/system';
import { upload } from './api.ts';

export default function Scan() @{
	const cam = camera();

	<main>
		<system.camera el={cam} facing="back" />
		<button onClick={async () => await upload(await cam.takePhoto())}>Scan</button>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { system } from '@markless/system';

export default function Invoice({ id }: { id: string }) @{
	let page = state(1);

	<section>
		@if (platform === 'web') {
			<iframe src={`/invoices/${id}.pdf`} title="Invoice" style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<system.pdf src={`/invoices/${id}.pdf`} page={page} onPageChange={(next) => (page = next)} />
		}
	</section>
}
```

## Answers

A: Orders uses `system.sheet` in the iPhone and Android apps, because the task asks for a sheet that looks and moves exactly like the phone's own sheets, and only a `system.*` element would draw the platform's own sheet. On the website it uses the `drawer` family, because nothing published says `system.sheet` works in a browser. WhatsNew uses the `drawer` family on every platform, because the designer's spec needs custom colours and corners, `drawer` parts take `style`/`class`, and `system.sheet` accepts no styling props. Scan uses `system.camera` fed by `camera()` from `@markless/device`, because that is the only live camera preview in the declarations, and its `el` prop takes the `Camera` object that also provides `takePhoto()`. Invoice uses `system.pdf` in the apps, the PDF viewer the package provides. On the website it uses an `<iframe>`, because nothing published says `system.pdf` renders there.

B: Orders: a website visitor sees the order list, a Filter button, and a styled bottom drawer with a backdrop and the All, Open and Shipped choices. WhatsNew: the same purple panel with rounded top corners and a "Got it" button, open on page load. Scan: if `system.camera` works on the web (which I assume), the visitor sees a live preview from their webcam and a Scan button that uploads the photo. Invoice: the browser's own PDF viewer embedded in the page.

Confidence: 2/5

## Guesses

- Whether `system.sheet`, `system.camera` and `system.pdf` render anything on the website. The declarations do not say. I branched on `platform` for the sheet and the PDF, but not for the camera, because there is no other preview element to fall back to.
- That `orientation="vertical"` makes the drawer slide up from the bottom, and that `drawer.content` is the visible panel to style.
- That `drawer.close` closes the drawer through the root's `onChange`.
- That the system camera, the `drawer` family and `system.pdf` are used as JSX elements named `<namespace.part>`, and that `system.sheet` children are ordinary markup.
- That the `sizes` value `['half']` is right for a three-item filter.
- That `camera()` asks for camera permission itself and that `takePhoto()` captures the frame shown in the preview.
- That a computed over the `platform` constant is fine for an `@if` condition (it could just as well be read directly, as in Invoice).
- The sample text in the "What's new" panel.

Tools used: none
