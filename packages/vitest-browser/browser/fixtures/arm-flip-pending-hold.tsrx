import { computed, state } from '@markless/core';

// T116 D8 repro: an @if INSIDE a settled @try arm whose test reads THROUGH
// the async computed. A mutation re-runs the computed; while the re-run is
// pending the branch must HOLD its prior arm (the pending snapshot has no
// value — flipping on it renders lies), and only the settle re-commit may
// change what is visible. Alternate-shaped from the dashboard issue page
// (fixture-hardcoding guardrail): a telescope panel, not a repo dashboard.
export default function TelescopePanel() @{
	let cycles = state(0);
	const scan = computed(async ({ signal }) => {
		const cycle = cycles;
		await new Promise((resolve) => setTimeout(resolve, cycle === 0 ? 10 : 150));
		if (signal.aborted) return { tracking: false, target: 'aborted' };
		return { tracking: cycle % 2 === 0, target: 'target-' + cycle };
	});

	<section data-panel>
		@try {
			<div>
				@if (scan.tracking) {
					<strong data-tracking-pill>Tracking</strong>
				} @else {
					<em data-idle-pill>Idle</em>
				}
				<output data-target>{scan.target}</output>
				<button type="button" data-cycle onClick={() => { cycles++; }}>Cycle</button>
			</div>
		} @pending {
			<p data-booting>Booting</p>
		} @catch {
			<p data-fault>Fault</p>
		}
	</section>
}
