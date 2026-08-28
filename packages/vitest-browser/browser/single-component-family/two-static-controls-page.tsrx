import { StaticControlDial, StaticControlNote } from './static-control/dial.tsrx';

export default function TwoStaticControlsPage() @{
	<section data-two-dials-page>
		<StaticControlDial tag="a" />
		<StaticControlDial tag="c" />
		<StaticControlNote />
	</section>
}
