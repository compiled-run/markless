import { computed, state } from '@markless/core';
import { PanelFrame } from './panel-frame.tsrx';
import { bumpPanelRenders } from './panel-render-probe.ts';

// T104 tier-3 proof, dashboard branch-menu shape: a sync-state @if (with a
// keyed @for inside it) inside a component's children inside @try. Toggling
// the drawer must flip ONLY the branch range — the render-count probe must
// not move — and a real re-settle (region write) must rewire the flip.
export function App() @{
	let drawerOpen = state(false);
	let region = state('west');
	const roster = computed(async ({ signal }) => {
		const zone = region;
		await new Promise((resolve) => setTimeout(resolve, 10));
		if (signal.aborted) return { zone: 'aborted', crews: [] };
		return { zone, crews: [{ callsign: zone + '-kestrel' }, { callsign: zone + '-osprey' }] };
	});

	<main>
		<button type="button" data-region onClick={() => region = 'east'}>Region</button>
		@try {
			<PanelFrame heading="Crews">
				<span data-render-count>{bumpPanelRenders()}</span>
				<div class="toolbar">
					<button type="button" data-drawer-toggle onClick={() => drawerOpen = !drawerOpen}>
						{roster.zone} crews
					</button>
					@if (drawerOpen) {
						<div class="drawer" data-drawer>
							@for (const crew of roster.crews; key crew.callsign) {
								<button class="drawer-item">{crew.callsign}</button>
							}
						</div>
					}
				</div>
			</PanelFrame>
		} @pending {
			<p class="pending">Loading</p>
		} @catch {
			<p class="broken">Broken</p>
		}
	</main>
}
