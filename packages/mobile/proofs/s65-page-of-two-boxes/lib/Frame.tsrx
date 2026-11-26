import type { Children } from '@markless/core';
import { Link } from '@markless/router';

export default function Frame({ children }: { readonly children?: Children }) @{
	<>
		<header class="bar">
			<Link href="/" class="brand">
				Two boxes
			</Link>
		</header>
		<main class="content">{children}</main>
	</>
}
