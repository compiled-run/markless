import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import stylesheet from './src/shared/styles.css?url';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<meta name="benchmark:entrant" content="markless" />
			<meta name="benchmark:build" content={import.meta.env.BENCHMARK_BUILD_ID} />
			<link rel="stylesheet" href={stylesheet} />
		</head>
		<body>{children}</body>
	</Html>
}
