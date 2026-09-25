import type { Children } from '@markless/core';
import { Html } from '@markless/router';

// oxlint-disable-next-line no-unused-vars -- used inside <script>{…}</script>, which tsrx lint does not see
const counter = 'window.__headRuns = (window.__headRuns || 0) + 1;';
// oxlint-disable-next-line no-unused-vars -- used inside <script>{…}</script>, which tsrx lint does not see
const lexical = 'const themeBoot = (document.documentElement.dataset.boot = "1");';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<script>{counter}</script>
			<script>{lexical}</script>
		</head>
		<body>{children}</body>
	</Html>
}
