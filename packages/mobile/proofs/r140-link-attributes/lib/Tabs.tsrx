import { Link } from '@markless/router';

export default function Tabs({ tab }: { readonly tab: 'home' | 'about' | 'item' }) @{
	<nav>
		<Link
			href="/"
			aria-current={tab === 'home' ? 'page' : undefined}
			aria-label={tab === 'home' ? 'Home tab, open' : 'Home tab'}
		>
			Home
		</Link>
		<Link
			href="/about"
			aria-current={tab === 'about' ? 'page' : undefined}
			aria-label={tab === 'about' ? 'About tab, open' : 'About tab'}
		>
			About
		</Link>
	</nav>
}
