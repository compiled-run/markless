import { state } from '@markless/core';
import { Link } from '@markless/router';
import Nav from '../src/nav.tsrx';

export default function Home() @{
	let count = state(0);

	<main data-page="home">
		<title>Home</title>
		<Nav />
		<output data-count>{count}</output>
		<button type="button" data-increment onClick={() => count++}>Increment</button>
		<a href="#" data-hash-empty>Top</a>
		<Link data-nowhere>Nowhere</Link>
		<a href="#section" data-hash-section>Section</a>
		<a href="/#section" data-path-section>Section by path</a>
		<div style="height: 1500px"></div>
		<h2 id="section">Section</h2>
	</main>
}
