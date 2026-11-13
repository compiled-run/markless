import { computed, state } from '@markless/core';
import { answer } from './answers.ts';

export default function Dashboard() @{
	let round = state(1);
	const alpha = computed(async () => await answer(`alpha ${round}`));
	const beta = computed(async () => await answer(round % 2 === 0 ? null : { text: `beta ${round}` }));
	const rows = computed(async () => await answer(['x', 'y', 'z'].slice(0, round).map((id) => ({ id, text: `row ${id}` }))));

	<article>
		<button type="button" data-more onClick={() => round++}>More</button>
		@try {
			@if (alpha) {
				<p data-alpha>{alpha}</p>
			}
		} @pending {
			<p data-loading>Loading</p>
		}
		@try {
			<section>
				@if (beta === null) {
					<p data-beta>none</p>
				} @else {
					<p data-beta>{beta?.text}</p>
				}
			</section>
		} @pending {
			<p data-loading>Loading</p>
		}
		@try {
			<ul data-rows>
				@for (const row of rows; key row.id) {
					<li>{row.text}</li>
				}
			</ul>
		} @pending {
			<p data-loading>Loading</p>
		}
	</article>
}
