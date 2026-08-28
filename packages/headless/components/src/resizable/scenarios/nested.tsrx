import { resizable } from '../../index.ts';

// The recursion rule: the same parts nest, and the panel that hosts the inner
// group carries the axis it lays its own panels along. There is no second root,
// and one sizes record covers both levels.
export default function Nested() @{
	<resizable.root
		defaultSizes={{ nav: 30, body: 70, top: 60, bottom: 40 }}
		data-testid="root"
		style="inline-size: 400px; block-size: 200px"
	>
		<resizable.item value="nav" data-testid="nav">Navigation</resizable.item>
		<resizable.thumb
			value="nav"
			min={10}
			max={70}
			aria-label="Resize navigation"
			data-testid="outer-thumb"
			style="inline-size: 8px; background: #ccc"
		/>
		<resizable.item value="body" orientation="vertical" data-testid="body">
			<resizable.item value="top" data-testid="top">Preview</resizable.item>
			<resizable.thumb
				value="top"
				min={20}
				max={80}
				orientation="vertical"
				aria-label="Resize preview"
				data-testid="inner-thumb"
				style="block-size: 8px; background: #ccc"
			/>
			<resizable.item value="bottom" data-testid="bottom">Console</resizable.item>
		</resizable.item>
	</resizable.root>
}
