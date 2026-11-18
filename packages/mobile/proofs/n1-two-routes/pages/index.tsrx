import { state } from '@markless/core';
import { Link } from '@markless/router';

export default function Home() @{
	let taps = state(0);
	<main>
		<title>Home</title>
		<h1>Start here</h1>
		<button onClick={() => taps++}>Taps {taps}</button>
		<Link href="/about">Open about</Link>
	</main>
}
