import type { Children } from '@markless/core';
import { Html } from '@markless/core/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title>Markless Router App</title>
		</head>
		<body>
			{children}
			<button data-unscoped-button>Outside page scope</button>
		</body>
	</Html>
}
