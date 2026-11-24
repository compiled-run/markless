import { Link } from '@markless/router';

export default function Nav({ children }: { readonly children: unknown }) @{
	<main>
		<nav>
			<Link href="/">Notes</Link>
		</nav>
		{children}
	</main>
}
