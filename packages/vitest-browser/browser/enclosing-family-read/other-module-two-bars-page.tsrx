import { Bar } from './bar.tsrx';
import { Plain } from './knob.tsrx';

// Axis 2 across two instances: cross-module parts that root no family.
export default function OtherModuleTwoBarsPage() @{
	<section data-other-module-two-bars-page>
		<Bar label="left">
			<Plain name="a" />
			<Plain name="b" />
			<Plain name="c" />
		</Bar>
		<Bar label="right">
			<Plain name="d" />
			<Plain name="e" />
		</Bar>
	</section>
}
