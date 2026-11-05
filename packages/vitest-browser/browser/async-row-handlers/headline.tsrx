import { computed, state } from '@markless/core';
import { fetchHeadline } from './fetch-rows.ts';

export default function Headline() @{
	let edition = state(1);
	const headline = computed(async () => await fetchHeadline(edition));

	<header>
		<button data-next onClick={() => edition++}>next</button>
		@try {
			<h1 data-title>{headline.title}</h1>
		} @pending {
			<span>loading</span>
		}
	</header>
}
