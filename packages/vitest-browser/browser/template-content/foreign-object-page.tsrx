import { state } from '@markless/core';

export default function ForeignObjectPage() @{
	let inner = state(0);
	let outer = state(0);

	<article>
		<svg viewBox="0 0 100 40" width="100" height="40">
			<rect width="100" height="40" />
			<foreignObject x="0" y="0" width="100" height="40">
				<div>
					<button type="button" data-inner onClick={() => inner++}>{inner}</button>
				</div>
			</foreignObject>
		</svg>
		<template>
			<ul>
				<li>inert</li>
			</ul>
		</template>
		<button type="button" data-outer onClick={() => outer++}>{outer}</button>
	</article>
}
