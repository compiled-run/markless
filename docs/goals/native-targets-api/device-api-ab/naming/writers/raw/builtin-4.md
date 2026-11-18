```tsrx
// file: Orders.tsrx
import { state } from '@markless/core';
import { platform } from '@markless/device';
import { builtin } from '@markless/builtin';
import { drawer } from '@markless/ui';

export default function Orders() @{
	const orders = ['A-1', 'A-2', 'A-3'];
	let filter = state<'All' | 'Open' | 'Shipped'>('All');
	let open = state(false);

	<main>
		<h1>Orders ({filter})</h1>
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
					<drawer.close>Cancel</drawer.close>
				</drawer.content>
			</drawer.root>
		} @else {
			<>
				<button onClick={() => (open = true)}>Filter</button>
				<builtin.sheet open={open} onChange={(next) => (open = next)} sizes={['half']}>
					<div>
						<button onClick={() => { filter = 'All'; open = false; }}>All</button>
						<button onClick={() => { filter = 'Open'; open = false; }}>Open</button>
						<button onClick={() => { filter = 'Shipped'; open = false; }}>Shipped</button>
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
		<drawer.content style="background: #5b21b6; color: #fff; border-radius: 24px 24px 0 0; padding: 24px;">
			<drawer.title>What's new</drawer.title>
			<p>Here is everything we shipped this month.</p>
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
		<button onClick={async () => await upload(await cam.takePhoto())}>Scan</button>
	</main>
}
```

```tsrx
// file: Invoice.tsrx
import { platform } from '@markless/device';
import { builtin } from '@markless/builtin';

export default function Invoice({ id }: { id: string }) @{
	<section>
		@if (platform === 'web') {
			<iframe src={`/invoices/${id}.pdf`} title={`Invoice ${id}`} style="width: 100%; height: 80vh; border: 0;" />
		} @else {
			<builtin.pdf src={`/invoices/${id}.pdf`} />
		}
	</section>
}
```

## Answers

A: In Orders, the filter sheet on iPhone and Android is `builtin.sheet`. "Builtin" reads as the platform's own control, which is the only way to look and move exactly like the sheets in the phone's own apps. On the website I use `drawer.*` instead, because nothing says `builtin.sheet` has a web version. In WhatsNew, the panel is `drawer.content`. It takes `PropsOf<'div'>`, so it accepts `style`/`class` for the designer's purple, white and rounded corners, and it renders the same markup on all three targets. `builtin.sheet` has no style props and would look different on each platform. In Scan, the preview is `builtin.camera` fed by `camera()` from `@markless/device`. It is the only preview element, and its `el` prop takes the `Camera` that `takePhoto()` is called on. In Invoice, the PDF is `builtin.pdf` in the apps and a plain `<iframe>` on the website, which uses the browser's own PDF viewer.

B: In Orders, a website visitor sees a Filter button that opens a sliding drawer with All, Open, Shipped and Cancel; picking one updates the heading. In WhatsNew, they see the same purple panel with rounded top corners, open when the page loads, and "Got it" closes it. In Scan, they see a live webcam preview, which I assume `camera()` provides through the browser's camera access, and a Scan button that uploads the photo. In Invoice, they see the PDF embedded in the browser's own viewer inside the page.

Confidence: 3/5

## Guesses

- How a member-expression component like `<drawer.root>` or `<builtin.sheet>` is written in `.tsrx` markup.
- Whether `builtin.sheet` and `builtin.pdf` render anything on the website. I branched on `platform` to be safe; if they do have web versions, the branches can go.
- Whether `builtin.camera` and `camera()` work in a desktop browser. I assumed they do, because there is no other camera element.
- That `orientation="vertical"` on `drawer.root` makes it slide from the bottom. Nothing gives a side or direction prop.
- That `drawer.root` respects `open={true}` on first render, so the panel is open when the page loads.
- That `style` accepts a string. It might need an object.
- That a filter choice only changes the heading. The order strings carry no status, so no real filtering is possible.
- That `builtin.sheet` with `sizes={['half']}` matches the system sheet's look and motion.
- That an async `onClick` handler outside `@try` is allowed.

Tools used: none
