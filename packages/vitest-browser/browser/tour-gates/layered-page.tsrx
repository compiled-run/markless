import { element } from '@markless/core';
import { Spot } from './spot.tsrx';
import { TourPanel, TourRoot } from './tour-shell.tsrx';

export default function TourLayeredPage() @{
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
		<TourRoot>
			<TourPanel>
				<Spot target={target} label="save-step">measure</Spot>
			</TourPanel>
		</TourRoot>
	</section>
}
