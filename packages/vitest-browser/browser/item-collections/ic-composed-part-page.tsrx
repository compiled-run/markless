import { IcComposedPart } from './ic-composed-part.tsrx';
import { IcRoot } from './ic-widget.tsrx';

// Flat parts, each one a wrapper that composes the card standing in the roster.
export default function IcComposedPartPage() @{
	<section data-ic-page>
		<IcRoot>
			<IcComposedPart>alpha</IcComposedPart>
			<IcComposedPart>bravo</IcComposedPart>
			<IcComposedPart>charlie</IcComposedPart>
		</IcRoot>
	</section>
}
