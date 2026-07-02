import { Html } from '@markless/core/router';

export default function Document({ children }: { readonly children?: unknown }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title>Markless Router App</title>
		</head>
		<body>{children}</body>
	</Html>
}
