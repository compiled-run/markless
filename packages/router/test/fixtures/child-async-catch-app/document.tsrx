import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html lang="en">
		<head>
			<meta charset="utf-8" />
			<title>Child @catch</title>
		</head>
		<body>{children}</body>
	</Html>
}
