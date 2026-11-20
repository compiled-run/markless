import { computed, state } from '@markless/core';
import { lookUp } from '../lib/words.ts';

export default function App() @{
	let shown = state(true);
	let word = state('apple');
	let detail = state('pear');
	const entry = computed(async ({ signal }) => lookUp(word, signal));
	const more = computed(async ({ signal }) => lookUp(detail, signal));
	<main>
		<h1>Nested</h1>
		<p>Asked: {word}</p>
		<p>Detail asked: {detail}</p>
		<button onClick={() => (shown = !shown)}>{shown ? 'Hide' : 'Show'}</button>
		<button onClick={() => (detail = 'missing')}>Break detail</button>
		<button onClick={() => (word = 'banana')}>Banana</button>
		@if (shown) {
			@try {
				<section>
					<p>Word: {entry.word}</p>
					@try {
						<p>Detail: {more.word}</p>
					} @pending {
						<p>Loading detail</p>
					} @catch (error) {
						<p>Detail failed: {error.message}</p>
					}
				</section>
			} @pending {
				<p>Loading word</p>
			} @catch (error) {
				<p>Word failed: {error.message}</p>
			}
		}
	</main>
}
