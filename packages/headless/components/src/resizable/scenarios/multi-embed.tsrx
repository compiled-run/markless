import { state } from '@markless/core';
import { resizable } from '../../index.ts';

const START: Record<string, number> = { nav: 30, main: 70 };
const WIDER: Record<string, number> = { nav: 45, main: 55 };

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. A divider only moves under a drag or a key and the
// battery's gesture is a bare click, so the page holds the sizes and a button
// writes a wider sidebar back in — the controlled shape a consumer already
// writes. The divider is still here for the roving check to press a key on.
export default function MultiEmbed() @{
	let held = state(START);

	<section data-testid="frame">
		<resizable.root
			sizes={held}
			data-testid="root"
			style="inline-size: 400px; block-size: 120px"
		>
			<resizable.item value="nav" data-testid="nav">Navigation</resizable.item>
			<resizable.thumb
				value="nav"
				min={10}
				max={80}
				aria-label="Resize navigation"
				data-testid="thumb"
				style="inline-size: 8px; background: #ccc"
			/>
			<resizable.item value="main" data-testid="main">Content</resizable.item>
		</resizable.root>
		<button
			type="button"
			data-testid="step"
			onClick={() => {
				held = WIDER;
			}}
		>Wider</button>
	</section>
}
