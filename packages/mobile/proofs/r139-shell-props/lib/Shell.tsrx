import type { Children } from '@markless/core';

export default function Shell({
	title,
	note,
	count,
	children,
}: {
	readonly title: string;
	readonly note: string;
	readonly count: number;
	readonly children?: Children;
}) @{
	<div>
		<title>{title}</title>
		<header>
			<h1>{title}</h1>
			<p>{note}</p>
			<Badge count={count} />
		</header>
		<main>{children}</main>
	</div>
}

function Badge({ count }: { readonly count: number }) @{
	<p hidden={count === 0}>{`${count} picked`}</p>
}
