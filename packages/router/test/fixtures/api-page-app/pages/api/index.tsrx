import { state } from '@markless/core';
import { Link } from '@markless/router';
import title from './title.ts';

export default function ApiReference() @{
	let opened = state(0);

	<main data-page="api">
		<h1>{title()}</h1>
		<button type="button" data-open onClick={() => opened++}>Open</button>
		<output data-opened>{opened}</output>
		<Link href="/" data-nav="home">Home</Link>
	</main>
}
