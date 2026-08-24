import { collapsible } from '../../index.ts';

// A parking FAQ, the shape the accessibility test plans use: several questions in
// a list, one of them already open on load. Each question is its own widget, so
// opening one leaves the others exactly where they were.
export default function Faq() @{
	<ul>
		<li>
			<collapsible.root data-testid="permit-root">
				<collapsible.trigger data-testid="permit-trigger">
					I have a permit but cannot find a space. What now?
				</collapsible.trigger>
				<collapsible.content data-testid="permit-content">
					Park at the nearest available meter and call the parking office.
				</collapsible.content>
			</collapsible.root>
		</li>
		<li>
			<collapsible.root open data-testid="rules-root">
				<collapsible.trigger data-testid="rules-trigger">
					Do all facilities have the same rules?
				</collapsible.trigger>
				<collapsible.content data-testid="rules-content">
					No. Each garage posts its own enforcement hours at the entrance.
				</collapsible.content>
			</collapsible.root>
		</li>
		<li>
			<collapsible.root data-testid="visitor-root">
				<collapsible.trigger data-testid="visitor-trigger">
					Where do visitors park?
				</collapsible.trigger>
				<collapsible.content data-testid="visitor-content">
					Visitors use the north lot and pay at the kiosk.
				</collapsible.content>
			</collapsible.root>
		</li>
	</ul>
}
