import { resizable } from '../../index.ts';

// A stacked group: the panels sit one above the other, so its divider is the
// horizontal one and Up and Down are its keys.
export default function Vertical() @{
	<resizable.root
		orientation="vertical"
		defaultSizes={{ preview: 60, console: 40 }}
		data-testid="root"
		style="inline-size: 200px; block-size: 300px"
	>
		<resizable.item value="preview" data-testid="preview">Preview</resizable.item>
		<resizable.thumb
			value="preview"
			min={20}
			max={80}
			aria-label="Resize preview"
			data-testid="thumb"
			style="block-size: 8px; background: #ccc"
		/>
		<resizable.item value="console" data-testid="console">Console</resizable.item>
	</resizable.root>
}
