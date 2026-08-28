import { resizable } from '../../index.ts';

// Two dividers in one group: each one moves its own pair and leaves the third
// panel alone.
export default function Three() @{
	<resizable.root
		defaultSizes={{ left: 25, middle: 50, right: 25 }}
		data-testid="root"
		style="inline-size: 400px; block-size: 120px"
	>
		<resizable.item value="left" data-testid="left">Left</resizable.item>
		<resizable.thumb
			value="left"
			min={10}
			max={60}
			aria-label="Resize left"
			data-testid="first-thumb"
			style="inline-size: 8px; background: #ccc"
		/>
		<resizable.item value="middle" data-testid="middle">Middle</resizable.item>
		<resizable.thumb
			value="middle"
			min={10}
			max={70}
			aria-label="Resize middle"
			data-testid="second-thumb"
			style="inline-size: 8px; background: #ccc"
		/>
		<resizable.item value="right" data-testid="right">Right</resizable.item>
	</resizable.root>
}
