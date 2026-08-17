import { Html } from '@markless/router';
import stylesheet from './styles/global.css?url';

export default function Document({ children }: { readonly children?: unknown }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title>Markless</title>
			<link rel="stylesheet" href={stylesheet} />
		</head>
		<body>{children}</body>
	</Html>
}
