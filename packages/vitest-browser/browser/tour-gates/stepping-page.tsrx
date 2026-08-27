import { element, state } from '@markless/core';
import { SpotStep } from './spot-step.tsrx';

export default function TourSteppingPage() @{
	const target = element<HTMLButtonElement>();
	const tour = state({ step: 'one' });

	<section data-tg-stepping-page>
		<button type="button" data-tg-target data-tg-step={tour.step} el={target}>Save</button>
		<button
			type="button"
			data-tg-advance
			onClick={() => {
				tour.step = 'two';
			}}
		>advance</button>
		<SpotStep target={target} />
	</section>
}
