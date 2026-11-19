import { computed, state } from '@markless/core';

export default function App() @{
	let words = state('banana apple cherry');
	const sorted = computed(() =>
		words
			.split(' ')
			.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
			.join(', '),
	);
	const longest = computed(() => {
		let best = '';
		for (const word of words.split(' ')) if (word.length > best.length) best = word;
		return best;
	});
	<main>
		<h1>Words</h1>
		<p>Sorted: {sorted}</p>
		<p>Longest: {longest}</p>
		<button onClick={() => (words = words + ' date')}>Add date</button>
		<button onClick={() => (words = 'kiwi elderberry fig')}>Replace</button>
	</main>
}
