import { Link } from '@markless/router';

export default function Nav() @{
	<nav>
		<Link href="/" data-nav="home">Home</Link>
		<Link href="/item/1" data-nav="item1">Item 1</Link>
		<Link href="/item/2" data-nav="item2">Item 2</Link>
		<Link href="/api/logout" data-nav="logout">Logout</Link>
	</nav>
}
