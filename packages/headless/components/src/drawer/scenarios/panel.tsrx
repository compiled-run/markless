import * as drawer from '../index.ts';

const PANEL = 'block-size: 320px; inline-size: 320px';

// The other two edges: a side panel anchored at the inline-start edge, and a
// sheet anchored at the block-start edge. Both are the same parts with
// `orientation` and `start`; neither is a placement prop, because which way a
// swipe closes the drawer is behaviour.
export default function Panel() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<drawer.root data-testid="side-root" orientation="horizontal" start>
			<drawer.trigger data-testid="side-trigger">Menu</drawer.trigger>
			<drawer.backdrop data-testid="side-backdrop">
				<drawer.content data-testid="side-content">
					<div data-testid="side-panel" style={PANEL}>
						<drawer.title data-testid="side-title">Menu</drawer.title>
						<drawer.close data-testid="side-close">Close menu</drawer.close>
					</div>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		<drawer.root data-testid="top-root" start>
			<drawer.trigger data-testid="top-trigger">Notifications</drawer.trigger>
			<drawer.backdrop data-testid="top-backdrop">
				<drawer.content data-testid="top-content">
					<div data-testid="top-panel" style={PANEL}>
						<drawer.title data-testid="top-title">Notifications</drawer.title>
						<drawer.close data-testid="top-close">Dismiss all</drawer.close>
					</div>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</section>
}
