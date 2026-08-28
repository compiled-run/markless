import { Bar } from './bar.tsrx';
import { Knob } from './knob.tsrx';

export default function TwoBarsPage() @{
	<section data-two-bars-page>
		<Bar label="left">
			<Knob name="a" />
			<Knob name="b" />
			<Knob name="c" />
		</Bar>
		<Bar label="right">
			<Knob name="d" />
			<Knob name="e" />
		</Bar>
	</section>
}
