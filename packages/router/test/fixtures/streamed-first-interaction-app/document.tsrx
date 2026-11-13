import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html lang="en">
		<head>
			<meta charset="utf-8" />
			<title>Streamed answers taken in at the first interaction</title>
		</head>
		<body>{children}</body>
	</Html>
}
