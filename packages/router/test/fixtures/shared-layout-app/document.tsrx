import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<style>
				{'body { margin: 0; font: 14px sans-serif; } .top a { display: inline-block; padding: 6px 10px; transition: background-color 0.3s; } .top a:hover { background-color: rgb(0, 0, 200); } .side { position: fixed; top: 40px; left: 0; width: 200px; bottom: 0; overflow: auto; } .side a { display: block; padding: 4px 8px; } .side a:hover, .side a[data-active="true"] { background-color: rgb(200, 0, 0); } main { margin-left: 220px; } .badge, .panel { transition: background-color 1s, color 1s; } .badge-solid { background-color: rgb(250, 0, 0); } .badge-outline { background-color: rgb(0, 0, 250); } .panel-dark { background-color: rgb(10, 10, 10); } .panel-light { background-color: rgb(240, 240, 240); }'}
			</style>
		</head>
		<body>{children}</body>
	</Html>;
}
