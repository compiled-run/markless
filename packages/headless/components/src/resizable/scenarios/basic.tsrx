import { resizable } from '../../index.ts';

// The family ships the flex defaults but no size, so every scenario gives the
// group its own box and the divider something to grab, the way a consumer's
// stylesheet would.
export default function Basic() @{
	<resizable.root
		defaultSizes={{ nav: 30, main: 70 }}
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
