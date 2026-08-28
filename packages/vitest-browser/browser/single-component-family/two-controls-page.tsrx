import { ControlDial } from './control/dial.tsrx';
import { ControlMark } from './control/mark.tsrx';

// The control page: same shape, but the family's module declares two
// components.
export default function TwoControlsPage() @{
	<section data-two-dials-page>
		<ControlDial tag="a">
			<ControlMark name="a1" />
			<ControlMark name="a2" />
		</ControlDial>
		<ControlDial tag="c">
			<ControlMark name="c1" />
			<ControlMark name="c2" />
		</ControlDial>
	</section>
}
