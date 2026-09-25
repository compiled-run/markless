import { Link } from '@markless/router';

export default function Nav() @{
	<nav>
		<Link href="/" data-nav="home">Home</Link>
		<Link href="/other" data-nav="other">Other</Link>
		<Link href="/slow" data-nav="slow">Slow</Link>
		<Link href="/form" data-nav="form">Form</Link>
		<Link href="/missing" data-nav="missing">Missing</Link>
		<Link href="/other" prefetch={false} data-nav="quiet">Quiet</Link>
	</nav>
}
