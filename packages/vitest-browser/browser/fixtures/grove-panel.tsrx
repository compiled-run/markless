import { computed, state } from '@markless/core';
import { CropBadge } from './crop-badge.tsrx';
import { GroveBadge } from './grove-badge.tsrx';

// Composed child-owned boundary whose @try arm composes two grandchildren, so
// the arm carries DOM updates reading the CHILD's own graph nodes: the async
// computed's member (the shape whose registration used to die) and a plain
// state. Both only register if their graph node ids took the child's instance
// path. `tally` feeds no runner, so writing it drives the arm's DOM update
// without re-settling the boundary.
export function GrovePanel() @{
	let tally = state(1);
	let season = state('early');
	const grove = computed(async ({ signal }) => {
		const at = season;
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return { name: 'aborted' };
		return { name: 'Pear ' + at };
	});

	<section data-grove>
		<button type="button" data-grove-tally onClick={() => tally++}>Tally</button>
		<button type="button" data-grove-reseed onClick={() => season = 'late'}>Reseed</button>
		@try {
			<>
				<CropBadge label={grove.name} />
				<GroveBadge label={tally} />
			</>
		} @pending {
			<p data-grove-wait>Growing</p>
		} @catch {
			<p data-grove-blight>Blighted</p>
		}
	</section>
}
