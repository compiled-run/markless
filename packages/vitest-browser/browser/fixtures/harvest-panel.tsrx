import { computed, state } from '@markless/core';
import { CropBadge } from './crop-badge.tsrx';

// Composed-boundary fixture: a CHILD component owns its own async boundary.
// Pages compose it (composed-boundary tests), so the boundary id, its arm
// records, and its runner/update symbols must all survive the c<N>: instance
// prefixing across SSR resume, CSR client-swap mounts, and re-settles. The
// @try arm contains a composed grandchild so static per-arm indexes are
// provably wrong (positional trust must come from the live render).
export function HarvestPanel() @{
	let picked = state('none');
	let season = state('spring');
	const crop = computed(async ({ signal }) => {
		const at = season;
		await new Promise((resolve) => setTimeout(resolve, 60));
		if (signal.aborted) return { name: 'aborted' };
		return { name: 'Rhubarb ' + at };
	});

	<section data-panel>
		<output data-picked>{picked}</output>
		<button type="button" data-reseed onClick={() => season = 'summer'}>Reseed</button>
		@try {
			<>
				<CropBadge label={crop.name} />
				<button type="button" data-pick onClick={() => picked = 'picked:' + crop.name}>Pick</button>
			</>
		} @pending {
			<div class="sprouting">
				<p data-wait>Sprouting</p>
				<button type="button" data-wave onClick={() => picked = 'waved'}>Wave</button>
			</div>
		} @catch {
			<p class="blighted">Blighted</p>
		}
	</section>
}
