import { Widget } from './handle-in-arm.tsrx';

// Served closed: the arm holding the bound element is not rendered at all.
export default function HandleInArmPage() @{
	<section data-page>
		<Widget>closed at serve</Widget>
	</section>
}
