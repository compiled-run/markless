import { state } from '@markless/core';
import { Link } from '@markless/router';

export default function Index() @{
	let clicks = state(0);
	const code = 'MARKLESS_FIRST';

	<main data-page="index">
		<button type="button" data-click onClick={() => clicks++}>{clicks}</button>
		<Link href="/errors/[code]" params={{ code }} data-error-link>{code}</Link>
	</main>
}
