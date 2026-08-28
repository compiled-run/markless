import { Panel } from './family/gauge.tsrx';
import { Mark } from './part.tsrx';

// Two rendered instances of the family, each holding adopting parts: the guard
// that ownership giving an outermost adopter its derives back does not let a
// part compose as a second root and merge the two rosters.
export default function TwoPanelsPage() @{
	<section data-two-panels-page>
		<Panel>
			<Mark name="a" />
			<Mark name="b" />
		</Panel>
		<Panel>
			<Mark name="c" />
		</Panel>
	</section>
}
