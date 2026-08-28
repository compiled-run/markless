import { V2Dial } from './v2/dial.tsrx';
import { V2Part } from './v2/part.tsrx';

export default function TwoV2Page() @{
	<section data-two-dials-page>
		<V2Dial>
			<V2Part name="a1" />
			<V2Part name="a2" />
		</V2Dial>
		<V2Dial>
			<V2Part name="c1" />
			<V2Part name="c2" />
		</V2Dial>
	</section>
}
