import { computed, state, storage } from '@markless/core';
import Badge from './badge.tsrx';
import * as words from './words.ts';

export default function MoodPage() @{
	let taps = state(0);
	let mood = storage('csr-mood', 'calm');
	const loud = computed(() => mood.toUpperCase());
	const parts = computed(() => mood.split('-'));

	<main data-cheerful={String(mood.startsWith('happy'))}>
		<button type="button" onClick={() => (taps += 1)}>Tap</button>
		<output data-direct>{mood}</output>
		<p data-fn>{words.say(mood, taps)}</p>
		<p data-computed>{loud}</p>
		@if (mood === 'calm') {
			<em>Calm</em>
		} @else {
			<strong>Not calm</strong>
		}
		<ul>
			@for (const part of parts; key part) {
				<li>{part}</li>
			}
		</ul>
		<Badge mood={mood} />
	</main>
}
