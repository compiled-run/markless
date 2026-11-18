import { computed, state } from '@markless/core';
import { balanceOf } from './fetch-accounts.ts';

export default function Weather() @{
	let scale = state(1);
	let places = state([
		{ id: 4, where: { city: 'Oslo' } },
		{ id: 7, where: { city: 'Lima' } },
	]);

	<section>
		@for (const place of places; key place.id) {
			<Forecast scale={scale} city={place.where.city} />
		}
		<button data-rescale onClick={() => (scale = scale * 10)}>Rescale</button>
		<button data-prepend onClick={() => (places = [{ id: 9, where: { city: 'Kyiv' } }, ...places])}>Prepend</button>
	</section>
}

export function Forecast({ city, scale }: { city: string; scale: number }) @{
	const reading = computed(async () => await balanceOf(city, scale));

	<article data-city={city}>
		@try {
			<p data-reading>{reading}</p>
		} @pending {
			<p data-reading-pending>reading</p>
		}
	</article>
}
