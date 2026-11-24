import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<style>{'body { margin: 0; font: 14px sans-serif; } svg { touch-action: none; } .pad { height: 3000px; }'}</style>
		</head>
		<body>{children}</body>
	</Html>;
}
