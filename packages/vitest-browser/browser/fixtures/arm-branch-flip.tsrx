import { computed, state } from '@markless/core';
import { PanelFrame } from './panel-frame.tsrx';
import { bumpPanelRenders } from './panel-render-probe.ts';

// A sync-state @if with a keyed @for inside it, in a component's children inside @try: toggling flips only the branch range, so the render-count probe stays put through toggles, refreshes and the recovery from a failed refresh.
export function App() @{
	let drawerOpen = state(false);
	let region = state('west');
	const roster = computed(async ({ signal }) => {
		const zone = region;
		await new Promise((resolve) => setTimeout(resolve, 10));
		if (signal.aborted) return { zone: 'aborted', crews: [] };
		if (zone === 'nowhere') throw new Error('No crews there');
		return { zone, crews: [{ callsign: zone + '-kestrel' }, { callsign: zone + '-osprey' }] };
	});

	<main>
		<button type="button" data-region onClick={() => region = 'east'}>Region</button>
		<button type="button" data-lost onClick={() => region = 'nowhere'}>Lost</button>
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
