import type { Children } from '@markless/core';
import { Html } from '@markless/core/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<title>Routed branch flips</title>
		</head>
		<body>{children}</body>
	</Html>
}
