import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<title>Prerender app</title>
		</head>
		<body>{children}</body>
	</Html>
}
