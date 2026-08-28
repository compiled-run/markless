import { state } from '@markless/core';
import * as drawer from '../index.ts';

const PANEL = 'block-size: 320px; inline-size: 320px';

// Both halves controlled: the page holds whether the drawer shows and which rest
// position it is at, so a swipe reports and nothing moves until the page hands
// the new value back.
export default function Controlled() @{
	const page = state({ isOpen: false, snap: 0.5, reported: '' });

	<section>
		<button type="button" data-testid="background">Background</button>
		<button
			type="button"
			data-testid="opener"
			onClick={() => {
				page.isOpen = true;
			}}
		>Open from the page</button>
		<button
			type="button"
			data-testid="closer"
			onClick={() => {
				page.isOpen = false;
			}}
		>Close from the page</button>
		<button
			type="button"
			data-testid="expander"
			onClick={() => {
				page.snap = 1;
			}}
		>Expand from the page</button>
		<drawer.root
			data-testid="root"
			open={page.isOpen}
			snapPoints={[0.5, 1]}
			snapPoint={page.snap}
			onSnapPointChange={(next: number) => {
				page.reported = String(next);
			}}
		>
			<drawer.backdrop data-testid="backdrop">
				<drawer.content data-testid="content">
					<div data-testid="panel" style={PANEL}>
						<drawer.title data-testid="title">Trip details</drawer.title>
						<drawer.close data-testid="close">Close</drawer.close>
					</div>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		<p data-testid="snap">{page.snap}</p>
		<p data-testid="reported">{page.reported}</p>
	</section>
}
