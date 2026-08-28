import { IcItem, IcRoot } from './ic-widget.tsrx';

export default function IcStaticPage() @{
	<section data-ic-page>
		<IcRoot>
			<IcItem>alpha</IcItem>
			<IcItem>bravo</IcItem>
			<IcItem>charlie</IcItem>
		</IcRoot>
	</section>
}
