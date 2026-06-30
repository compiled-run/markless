import { Html } from '@arcade/router';
import stylesheetHref from './src/styles.css?url';

export default function Document({ children }: { readonly children?: unknown }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title>Arcade Music Player</title>
			<link rel="stylesheet" href={stylesheetHref} />
		</head>
		<body>{children}</body>
	</Html>
}
