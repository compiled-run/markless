import { state } from '@markless/core';

export default function Home() @{
	let pick = state('3');
	<main>
		<title>Links</title>
		<h1>Start page</h1>
		<a href="/about">About us</a>
		<a href="/items/7">Item seven</a>
		<a href={`/items/${pick}`}>Open item {pick}</a>
		<button onClick={() => (pick = '9')}>Pick 9</button>
	</main>
}
