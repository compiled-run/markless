import { state } from '@markless/core';
import { Link } from '@markless/router';

export default function Home() @{
	let clicks = state(0);

	<main data-page="home">
		<h1>Prerendered home</h1>
		<button type="button" data-click onClick={() => clicks++}>{clicks}</button>
		<Link href="/guide" data-to-guide>Guide</Link>
	</main>
}
