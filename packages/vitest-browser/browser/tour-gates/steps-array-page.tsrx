import { element } from '@markless/core';
import { SpotListWhole } from './spot-list.tsrx';

// Loaded through fetch inside the test, so its refusal is the test's subject
// rather than this directory's import error.
export default function TourStepsArrayPage() @{
	const target = element<HTMLButtonElement>();

	<section data-tg-array-page>
		<button type="button" data-tg-target el={target}>Save</button>
		<SpotListWhole steps={[{ target, label: 'save-step' }]} />
	</section>
}
