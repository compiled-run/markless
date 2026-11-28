import { Link } from '@markless/router';

export default function Page() @{
	<main data-main="plain">
		<h1 data-title>{'Plain page'}</h1>
		<p>{'This page has no part with state of its own.'}</p>
		<Link href="/guide" data-plain-guide>{'Guide'}</Link>
	</main>
}
