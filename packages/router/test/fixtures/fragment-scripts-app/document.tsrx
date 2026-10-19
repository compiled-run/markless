import type { Children } from '@markless/core';
import { Html } from '@markless/router';

// Each page's head is chosen by its URL, the way a migrated site writes one per page.
const heads: Record<string, { readonly title: string; readonly scripts: readonly string[]; readonly inline?: string }> = {
	'/': { title: 'Plain page', scripts: [] },
	'/library': {
		title: 'Library page',
		scripts: ['/library.js'],
		inline: 'window.__order = ["head-inline"];',
	},
};

export default function Document({
	url,
	children,
}: {
	readonly url?: { readonly pathname: string };
	readonly children?: Children;
}) @{
	const head = heads[url?.pathname ?? '/'] ?? heads['/']!;

	<Html lang="en">
		<head>
			<meta charset="utf-8" />
			<title>{head.title}</title>
			@if (head.inline) {
				<script>{head.inline}</script>;
			}
			@for (const script of head.scripts; key script) {
				<script src={script}></script>;
			}
		</head>
		<body>
			{children}
			<script src="/shell.js"></script>
		</body>
	</Html>
}
