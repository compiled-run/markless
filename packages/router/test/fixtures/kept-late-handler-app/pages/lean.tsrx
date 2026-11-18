import { state } from '@markless/core';
import { Link } from '@markless/router';

export default function Page() @{
	let held = state('idle');

	<main data-main="lean">
		<h1 data-title>{'Lean page'}</h1>
		<button type="button" data-hold onClick={() => {
			held = 'holding';
			return fetch('/hold');
		}}>{'Hold'}</button>
		<span data-held>{held}</span>
		<Link href="/reference" data-nav="reference">{'Reference'}</Link>
	</main>
}
