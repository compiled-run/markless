import { state } from '@markless/core';

export default function TemplatePage() @{
	let count = state(0);

	<main>
		<template id="t">
			<div>
				<span>inert</span>
				<span>content</span>
			</div>
		</template>
		<p>static</p>
		<button id="b" data-bump onClick={() => count++}>{count}</button>
	</main>
}
