import { Link } from '@markless/router';

export default function Nav() @{
	<nav class="nav" data-probe="nav">
		<style>
			.nav { --nav-mark: nav; display: flex; gap: 12px; padding: 8px; background-color: rgb(230, 240, 250); }
			.nav a { color: rgb(0, 60, 160); }
		</style>
		<span class="site-mark" data-probe="mark">{'Site'}</span>
		<Link href="/" data-nav="home">Home</Link>
		<Link href="/other" data-nav="other">Other</Link>
	</nav>
}
