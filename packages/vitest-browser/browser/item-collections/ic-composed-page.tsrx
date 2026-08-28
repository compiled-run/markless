import { IcItem, IcRoot } from './ic-widget.tsrx';

// The items never sit in the same component as the root: a consumer's own
// wrapper holds the root, and the items reach it as projected children. Passing
// through a component edge must not change what position an item has.
export default function IcComposedPage() @{
	<section data-ic-page>
		<Panel>
			<IcItem>alpha</IcItem>
			<IcItem>bravo</IcItem>
			<IcItem>charlie</IcItem>
		</Panel>
	</section>
}

function Panel({ children }) @{
	<IcRoot>
		<div data-ic-panel>{children}</div>
	</IcRoot>
}
