import { element } from '@markless/core';
import { Spot } from './spot.tsrx';

// A CONSUMER page mints the handle, binds it on its own button, and hands it
// across the component edge as a bare prop. The page's own probe is the control:
// it reads the same handle from a handler this module owns.
export default function TourBarePropPage() @{
	const target = element<HTMLButtonElement>();

	<section data-tg-page>
		<button type="button" data-tg-target el={target}>Save</button>
		<button
			type="button"
			data-tg-own-probe
			onClick={() => {
				target?.setAttribute('data-tg-own-seen', typeof target);
			}}
		>own probe</button>
		<Spot target={target} label="save-step">measure</Spot>
	</section>
}
