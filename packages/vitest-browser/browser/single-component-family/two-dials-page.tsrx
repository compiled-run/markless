import { Dial } from './family/dial.tsrx';
import { Mark } from './mark.tsrx';

// Two rendered instances of the single-component family, each holding its own
// parts: a roster that merged across instances would read the same four names
// twice.
export default function TwoDialsPage() @{
	<section data-two-dials-page>
		<Dial tag="a">
			<Mark name="a1" />
			<Mark name="a2" />
		</Dial>
		<Dial tag="c">
			<Mark name="c1" />
			<Mark name="c2" />
		</Dial>
	</section>
}
