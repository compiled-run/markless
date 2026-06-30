import { Link } from 'arcade/router';

export function Sidebar({ active }: { readonly active: string }) @{
	<nav aria-label="Docs">
		<Link href="/docs">Intro</Link>
		<Link href="/docs/[...slug]" params={{ slug: active }}>
			Active
		</Link>
	</nav>
}
