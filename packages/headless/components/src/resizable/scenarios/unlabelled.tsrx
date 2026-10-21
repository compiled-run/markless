import { resizable } from '../../index.ts';

// A divider written without aria-label: the family invents no name, so its labelling element stays empty.
export default function Unlabelled() @{
	<resizable.root
		defaultSizes={{ nav: 30, main: 70 }}
		data-testid="root"
		style="inline-size: 400px; block-size: 120px"
	>
		<resizable.item value="nav" data-testid="nav">Navigation</resizable.item>
		<resizable.thumb value="nav" data-testid="thumb" style="inline-size: 8px; background: #ccc" />
		<resizable.item value="main" data-testid="main">Content</resizable.item>
	</resizable.root>
}
