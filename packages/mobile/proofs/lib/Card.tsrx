import type { Children } from '@markless/core';

export function Card({ title, children }: { title: string; children?: Children }) @{
	<section>
		<h2>{title}</h2>
		{children}
	</section>
}
