import { Link } from '@markless/router';

export default function Home() @{
	<main>
		<h1>Static home</h1>
		<p>This page has no handlers and no state.</p>
		<nav>
			<Link href="/about/">About</Link>
			<Link href="/counter/">Counter</Link>
		</nav>
	</main>
}
