import { element } from '@markless/core';
import { SpotListIndexed } from './spot-indexed.tsrx';

// The same array, read one entry at a time. This one compiles.
export default function TourIndexedArrayPage() @{
	const target = element<HTMLButtonElement>();

	<section data-tg-indexed-page>
		<button type="button" data-tg-target el={target}>Save</button>
		<SpotListIndexed steps={[{ target, label: 'save-step' }]} />
	</section>
}
