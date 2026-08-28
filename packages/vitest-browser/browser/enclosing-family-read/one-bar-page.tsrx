import { Bar } from './bar.tsrx';
import { Knob } from './knob.tsrx';

export default function OneBarPage() @{
	<section data-one-bar-page>
		<Bar label="only">
			<Knob name="a" />
			<Knob name="b" />
			<Knob name="c" />
		</Bar>
	</section>
}
