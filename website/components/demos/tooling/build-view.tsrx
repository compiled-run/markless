import { state } from '@markless/core';

// The error text is what the Markless build printed for this exact file.
export default function BuildView() @{
	let keyed = state(false);
	let buildRan = state(false);

	<section class="explorer">
		<div class="playground-controls">
			<button
				type="button"
				class="pick"
				aria-pressed={keyed ? 'false' : 'true'}
				onClick={() => {
					keyed = false;
					buildRan = false;
				}}
			>
				No key
			</button>
			<button
				type="button"
				class="pick"
				aria-pressed={keyed ? 'true' : 'false'}
				onClick={() => {
					keyed = true;
					buildRan = false;
				}}
			>
				Add a key
			</button>
			<button type="button" onClick={() => (buildRan = true)}>
				Build
			</button>
		</div>
		<p class="name">List.tsrx</p>
		<pre class="file-lines">
			<span class="file-line">{"import { state } from '@markless/core';"}</span>
			<span class="file-line"> </span>
			<span class="file-line">{'export default function List() @{'}</span>
			<span class="file-line">{"\tlet items = state(['a', 'b']);"}</span>
			<span class="file-line"> </span>
			<span class="file-line">{'\t<ul>'}</span>
			<span class={keyed ? 'file-line' : 'file-line wrong'}>
				{keyed
					? '\t\t@for (const item of items; key item) {'
					: '\t\t@for (const item of items) {'}
			</span>
			<span class="file-line">{'\t\t\t<li>{item}</li>'}</span>
			<span class="file-line">{'\t\t}'}</span>
			<span class="file-line">{'\t</ul>'}</span>
			<span class="file-line">{'}'}</span>
		</pre>
		<pre class={buildRan && !keyed ? 'out failed' : 'out'}>
			{buildRan
				? keyed
					? 'Built. No errors, no warnings.'
					: 'MARKLESS_COMPILE_BLOCKED: List.tsrx has 1 compiler error(s).\n\nMARKLESS_REPEAT_KEY_REQUIRED: @for (const item of items) repeats reactive state without a key. When items changes, the rows of this list have no identity to update, reorder, or resume by. (List.tsrx:7:3)\nA keyed loop item keeps its state, events, and DOM attached to the same logical item across reorder, insert, and delete; without a key there is no stable identity root.\nAdd a stable domain key such as `@for (const item of items; key item.id)`, or key by position with `index i; key i` when state should follow the slot.\nhttps://markless.dev/errors/MARKLESS_REPEAT_KEY_REQUIRED'
				: 'Press Build.'}
		</pre>

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

			.out {
				margin: 0;
				white-space: pre-wrap;
				overflow-wrap: anywhere;
				font-size: var(--step--2);
			}

			.out.failed {
				border-left: 4px solid var(--pink);
			}
		</style>
	</section>;
}
