import { Panel, PanelMark } from './family/gauge.tsrx';
import { Mark } from './part.tsrx';

// The other direction: the adopting parts sit inside a rendered root of the
// family, so the enclosing instance owns their nodes and their writes and
// element() registrations both land in it. `PanelMark` is the control - the
// same part written in the family's own module.
export default function EnclosingPage() @{
	<section data-enclosing-page>
		<Panel>
			<Mark name="a" />
			<Mark name="b" />
			<PanelMark name="c" />
		</Panel>
	</section>
}
