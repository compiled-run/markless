import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<style>{'body { margin: 0; font: 14px sans-serif; } .site-nav a[data-active="true"] { font-weight: bold; }'}</style>
		</head>
		<body>{children}</body>
	</Html>;
}
