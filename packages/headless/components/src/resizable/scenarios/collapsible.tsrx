import { resizable } from '../../index.ts';

// Enter on the divider collapses the sidebar to 5% and the next Enter puts back
// the size it had.
export default function Collapsible() @{
	<resizable.root
		defaultSizes={{ sidebar: 30, editor: 70 }}
		data-testid="root"
		style="inline-size: 400px; block-size: 120px"
	>
		<resizable.item value="sidebar" data-testid="sidebar">Files</resizable.item>
		<resizable.thumb
			value="sidebar"
			min={15}
			max={60}
			collapsible={true}
			collapsedSize={5}
			aria-label="Resize files"
			data-testid="thumb"
			style="inline-size: 8px; background: #ccc"
		/>
		<resizable.item value="editor" data-testid="editor">Editor</resizable.item>
	</resizable.root>
}
