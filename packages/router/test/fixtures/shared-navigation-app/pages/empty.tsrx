import { Link } from '@markless/router';

export default function Empty() @{
	<main>
		<h1 data-title>{'Empty'}</h1>
		<Link href="/next" data-go-next>next</Link>
	</main>
}
