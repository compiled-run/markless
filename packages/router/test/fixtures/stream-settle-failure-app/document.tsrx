import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html lang="en">
		<head>
			<meta charset="utf-8" />
			<title>Markless repros from the HN RSC port</title>
		</head>
		<body>{children}</body>
	</Html>
}
