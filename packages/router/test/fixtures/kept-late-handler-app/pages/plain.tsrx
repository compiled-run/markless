import { Link } from '@markless/router';

export default function Page() @{
	<main data-main="plain">
		<h1 data-title>{'Plain page'}</h1>
		<p>{'This page has no event handlers.'}</p>
		<Link href="/reference" data-nav="reference">{'Reference'}</Link>
	</main>
}
