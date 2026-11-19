import { state } from '@markless/core';

function initials(name: string): string {
	return name
		.split(' ')
		.map((part) => part.charAt(0).toUpperCase())
		.join('');
}

function byLength(words: readonly string[]): string[] {
	return [...words].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
}

export default function Words() @{
	let words = state(['kiwi', 'fig', 'banana']);
	<main>
		<title>Words</title>
		<h1>Words page</h1>
		<p>Initials: {initials(words.join(' '))}</p>
		<ul>
			@for (const word of byLength(words); key word) {
				<li>{word}</li>
			}
		</ul>
	</main>
}
