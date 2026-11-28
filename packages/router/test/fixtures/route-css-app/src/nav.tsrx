import { Link } from '@markless/router';

export default function Nav() @{
	<nav class="nav" data-probe="nav">
		<style>
			.nav { display: flex; gap: 12px; padding: 8px; background-color: rgb(230, 240, 250); }
		</style>
		<Link href="/" data-nav="home">Home</Link>
		<Link href="/notes" data-nav="notes">Notes</Link>
		<Link href="/recipes" data-nav="recipes">Recipes</Link>
		<Link href="/garden" data-nav="garden">Garden</Link>
		<Link href="/ui/dial" data-nav="dial">Dial</Link>
		<Link href="/ui/meter" data-nav="meter">Meter</Link>
	</nav>
}
