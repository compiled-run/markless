import { element } from '@markless/core';
import { SpotListIndexed } from './spot-indexed.tsrx';

// Loaded through fetch inside the test: the array literal is refused at this edge.
export default function TourIndexedArrayPage() @{
	const target = element<HTMLButtonElement>();

	<section data-tg-indexed-page>
		<button type="button" data-tg-target el={target}>Save</button>
		<SpotListIndexed steps={[{ target, label: 'save-step' }]} />
	</section>
}
