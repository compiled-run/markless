import { Bar } from './bar.tsrx';
import { Plain } from './knob.tsrx';

// Axis 2: registering parts in ANOTHER module that root no family of their own.
export default function OtherModulePage() @{
	<section data-other-module-page>
		<Bar label="only">
			<Plain name="a" />
			<Plain name="b" />
			<Plain name="c" />
		</Bar>
	</section>
}
