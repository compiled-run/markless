import type { Children } from '@markless/core';
import { Link } from '@markless/router';

export default function Layout({
	name,
	children,
}: {
	readonly name: string;
	readonly children?: Children;
}) @{
	<header data-page={name}>
		<Link href="/" data-nav="home">Home</Link>
		<Link href="/other" data-nav="other">Other</Link>
	</header>
	<main>{children}</main>
	<footer data-footer>{`${name} footer`}</footer>
}
