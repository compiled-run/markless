import Home from './starter-home.tsrx';

export default function StarterDemo() @{
	<div class="playground">
		<p class="address">localhost:5173</p>
		<Home />

		<style>
			.address {
				margin: 0;
				padding: 0.2em 0.8em;
				border: 2px solid color-mix(in oklch, var(--ink) 45%, transparent);
				border-radius: 999px;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				opacity: 0.8;
			}
		</style>
	</div>
}
