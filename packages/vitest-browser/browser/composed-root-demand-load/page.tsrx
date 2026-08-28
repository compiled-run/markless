import { BarItem } from './bar.tsrx';
import { PanelSurface } from './panel.tsrx';

// Two items, so "the instance the gesture landed in" and "the first rendered
// instance" are different answers. The second item is the one every cold row
// gestures on.
export default function ComposedRootPage() @{
	<section data-composed-root-page>
		<BarItem name="one">
			<PanelSurface>one</PanelSurface>
		</BarItem>
		<BarItem name="two">
			<PanelSurface>two</PanelSurface>
		</BarItem>
	</section>
}
