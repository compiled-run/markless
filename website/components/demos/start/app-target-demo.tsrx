import Counter from './counter.tsrx';

export default function AppTargetDemo() @{
	<div class="playground">
		<p class="label">{'<div id="app">'}</p>
		<div class="target">
			<Counter />
		</div>
		<p class="label">{'</div>'}</p>

		<style>
			.label {
				margin: 0;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				opacity: 0.7;
			}

			.target {
				padding: var(--space-s);
				border: 2px dashed color-mix(in oklch, var(--ink) 45%, transparent);
				border-radius: 4px;
			}
		</style>
	</div>
}
