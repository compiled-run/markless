import type { Children } from '@markless/core';
import { Html } from '@markless/core/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<title>Row component in prop-fed rows</title>
		</head>
		<body>{children}</body>
	</Html>
}
