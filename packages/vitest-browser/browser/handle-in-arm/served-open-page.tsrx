import { Widget } from './handle-in-arm.tsrx';

// Served open: the arm holding the bound element is the one the render painted.
export default function ServedOpenPage() @{
	<section data-page>
		<Widget startOpen={true}>open at serve</Widget>
	</section>
}
