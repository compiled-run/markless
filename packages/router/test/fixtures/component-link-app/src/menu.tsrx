import { Link } from '@markless/router';

export default function Menu() @{
	<nav>
		<Link data-menu="nowhere">Nowhere</Link>
		<Link href="/second" data-menu="second">Second</Link>
	</nav>
}
