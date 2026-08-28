import { Bar } from './bar.tsrx';
import { SolePart } from './sole-part.tsrx';

export default function SolePartTwoBarsPage() @{
	<section data-sole-part-two-bars-page>
		<Bar label="left">
			<SolePart name="a" />
			<SolePart name="b" />
			<SolePart name="c" />
		</Bar>
		<Bar label="right">
			<SolePart name="d" />
			<SolePart name="e" />
		</Bar>
	</section>
}
