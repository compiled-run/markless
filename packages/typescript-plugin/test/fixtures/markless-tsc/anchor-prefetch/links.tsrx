import type { PropsOf } from '@markless/core';

// A component whose props are an <a>'s passes prefetch through its spread.
export function NavLink({ children, ...rest }: PropsOf<'a'>) @{
	<a {...rest}>{children}</a>
}

export function Links({ mode }: { readonly mode: boolean }) @{
	<nav>
		<a href="/logout" prefetch={false}>Log out</a>
		<a href="/about" prefetch>About</a>
		<a href="/docs" prefetch={mode}>Docs</a>
		<a href="/blog/[slug]" params={{ slug: 'hello' }}>First post</a>
		<NavLink href="/" prefetch={false}>Home</NavLink>
	</nav>
}
