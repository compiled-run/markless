import { resizable } from '../../index.ts';

// A fractional step, so a long run of keystrokes is the place any rounding drift
// would show up: the two shares still have to sum to the whole group.
export default function FineStep() @{
	<resizable.root
		defaultSizes={{ nav: 30, main: 70 }}
		step={0.1}
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
}
