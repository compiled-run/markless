import { state } from '@markless/core';

function slug(title: string): string {
	let out = '';
	let dash = false;
	for (const char of title.toLowerCase()) {
		const kept = (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9');
		if (kept) {
			out += char;
			dash = false;
		} else if (!dash && out.length > 0) {
			out += '-';
			dash = true;
		}
	}
	return dash ? out.slice(0, -1) : out;
}

export default function App() @{
	let title = state('Hello, Native World!');
	let made = state('none');
	let words = state(0);
	<main>
		<h1>Slugs</h1>
		<p>Title: {title}</p>
		<p>Slug: {made}</p>
		<p>Words: {words}</p>
		<button
			onClick={() => {
				made = slug(title);
				let count = 0;
				for (const part of title.split(' ')) if (part.length > 0) count++;
				words = count;
			}}
		>
			Make slug
		</button>
		<button onClick={() => (title = title + ' Again')}>Longer</button>
	</main>
}
