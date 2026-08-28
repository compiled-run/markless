import { Bar } from './bar.tsrx';
import { Knob } from './knob.tsrx';

// A bar and a knob that stands OUTSIDE it on the same page: the loose knob must
// not appear in the bar's roster.
export default function MixedPage() @{
	<section data-mixed-page>
		<Bar label="only">
			<Knob name="a" />
			<Knob name="b" />
		</Bar>
		<Knob name="loose" />
	</section>
}
