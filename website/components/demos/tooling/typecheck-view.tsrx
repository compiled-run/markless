import { state } from '@markless/core';

// The output lines are what the Markless type checker printed for these two files.
export default function TypecheckView() @{
	let shown = state('number');
	let checked = state(false);

	<section class="explorer">
		<div class="playground-controls">
			<button
				type="button"
				class="pick"
				aria-pressed={shown === 'number' ? 'true' : 'false'}
				onClick={() => {
					shown = 'number';
					checked = false;
				}}
			>
				{'label={42}'}
			</button>
			<button
				type="button"
				class="pick"
				aria-pressed={shown === 'string' ? 'true' : 'false'}
				onClick={() => {
					shown = 'string';
					checked = false;
				}}
			>
				label="Home"
			</button>
			<button type="button" onClick={() => (checked = true)}>
				Check
			</button>
		</div>
		<p class="name">Nav.tsrx</p>
		<pre class="file-lines">
			<span class="file-line">
				{'export function Nav({ label }: { readonly label: string }) @{'}
			</span>
			<span class="file-line">{'\t<nav>{label}</nav>'}</span>
			<span class="file-line">{'}'}</span>
		</pre>
		<p class="name">App.tsrx</p>
		<pre class="file-lines">
			<span class="file-line">{"import { Nav } from './Nav.tsrx';"}</span>
			<span class="file-line"> </span>
			<span class="file-line">{'export function App() @{'}</span>
			<span class={shown === 'number' ? 'file-line wrong' : 'file-line'}>
				{shown === 'number' ? '\t<Nav label={42} />' : '\t<Nav label="Home" />'}
			</span>
			<span class="file-line">{'}'}</span>
		</pre>
		<p class="playground-output">
			{checked
				? shown === 'number'
					? "App.tsrx(4,7): error TS2322: Type 'number' is not assignable to type 'string'."
					: 'No errors.'
				: 'Press Check to run the type checker.'}
		</p>

		<style>
			.pick {
				color: var(--ink);
			}

			button[aria-pressed='true'] {
				background: var(--yellow);
				color: var(--on-accent);
			}

			.name {
				margin: 0;
				font-family: var(--font-mono);
				font-size: var(--step--2);
			}

			pre {
				margin: 0;
				tab-size: 2;
			}

			pre,
			pre span {
				font-family: var(--font-mono);
			}

			.wrong {
				border-left-color: var(--pink);
			}

			.playground-output {
				font-family: var(--font-mono);
				font-size: var(--step--1);
				overflow-wrap: anywhere;
			}
		</style>
	</section>;
}
