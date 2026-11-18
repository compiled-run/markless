import { state } from '@markless/core';

export default function App() @{
	let visits = state(0);
	<main>
		<title>Document elements</title>
		<meta name="description" content="A page with document metadata" />
		<link rel="canonical" href="https://markless.dev/" />
		<link rel="dns-prefetch" href="https://markless.dev" />
		<link rel="icon" href="data:," />
		<script type="application/ld+json">{'{"@type":"WebPage"}'}</script>
		<template>
			<p>Template content</p>
		</template>
		<noscript>
			<p>Scripts are off</p>
		</noscript>
		<h1>Metadata</h1>
		<p>{'Visits ' + visits}</p>
		<button onClick={() => visits++}>Visit</button>
	</main>
}
