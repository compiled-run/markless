import { computed, state } from '@markless/core';

export function App() @{
	let panelOpen = state(false);
	let tab = state('berths');
	let picked = state('');
	const harbor = computed(async () => ({ title: 'Moorings' }));

	<section>
		@try {
			<>
			<button type="button" data-open onClick={() => panelOpen = !panelOpen}>
				{harbor.title}
			</button>
			@if (panelOpen) {
				<div data-mooring-panel>
					<button type="button" data-close onClick={() => panelOpen = false}>Close</button>
					<button type="button" data-tab-berths onClick={() => tab = 'berths'}>Berths</button>
					<button type="button" data-tab-docks onClick={() => tab = 'docks'}>Docks</button>
					@switch (tab) {
						@case 'berths': {
							<div data-berths>Berths</div>
						}
						@case 'docks': {
							<div data-docks>
								<button type="button" data-dock-row onClick={() => picked = 'dock'}>
									Dock
								</button>
							</div>
						}
						@default: {
							<p data-empty>Empty</p>
						}
					}
				</div>
			}
			@if (picked) {
				<p data-picked>{picked}</p>
			}
			</>
		} @pending {
			<p>Loading</p>
		} @catch {
			<p>Broken</p>
		}
	</section>
}
