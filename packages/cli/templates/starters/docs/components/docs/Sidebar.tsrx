export function Sidebar({ active }: { readonly active: string }) @{
	<nav aria-label="Docs">
		<a href="/docs">Intro</a>
		<a href="/docs/[...slug]" params={{ slug: active }}>Active</a>
	</nav>
}
