import { IcItem, IcRoot } from './ic-widget.tsrx';

// Two collections on one page. A position counts within the instance holding
// the item, so the second root's first item is 0 and not 2.
export default function IcTwoInstancesPage() @{
	<section data-ic-page>
		<div data-ic-first>
			<IcRoot>
				<IcItem>alpha</IcItem>
				<IcItem>bravo</IcItem>
			</IcRoot>
		</div>
		<div data-ic-second>
			<IcRoot>
				<IcItem>charlie</IcItem>
				<IcItem>delta</IcItem>
				<IcItem>echo</IcItem>
			</IcRoot>
		</div>
	</section>
}
