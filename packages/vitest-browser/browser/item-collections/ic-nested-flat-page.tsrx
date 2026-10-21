import { IcItem, IcRoot } from './ic-widget.tsrx';

// The flat items one component down, in a module whose first component is the page:
// a host id numbers that component's edges from its own first edge, a symbol id from the module's.
export default function IcNestedFlatPage() @{
	<section data-ic-page>
		<p>The items stand one component down.</p>
		<IcNestedFlat />
	</section>
}

function IcNestedFlat() @{
	<div data-ic-first>
		<IcRoot>
			<IcItem>alpha</IcItem>
			<IcItem>bravo</IcItem>
			<IcItem>charlie</IcItem>
		</IcRoot>
	</div>
}
