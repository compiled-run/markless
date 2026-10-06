import { state } from '@markless/core';

// Text bindings rather than a record lookup: a computed that reads a plain object
// is not in the chunk the click runs.
export default function CiModes() @{
	let mode = state('fast');

	<section class="explorer">
		<div class="playground-controls">
			<button type="button" class="pick" aria-pressed={mode === 'fast' ? 'true' : 'false'} onClick={() => mode = 'fast'}>--fast</button>
			<button type="button" class="pick" aria-pressed={mode === 'full' ? 'true' : 'false'} onClick={() => mode = 'full'}>--full</button>
			<button type="button" class="pick" aria-pressed={mode === 'ci' ? 'true' : 'false'} onClick={() => mode = 'ci'}>CI only</button>
		</div>
		<p class="playground-output">
			<code>{mode === 'fast' ? 'pnpm ci:local --fast' : mode === 'full' ? 'pnpm ci:local --full' : 'git push'}</code>
		</p>
		<ul>
			<li data-on={mode === 'ci' ? 'no' : 'yes'}>
				<strong>{mode === 'ci' ? 'Also run on your machine' : 'Runs'}</strong>
				<span>agent-files, typecheck, unit</span>
			</li>
			<li data-on={mode === 'full' ? 'yes' : 'no'}>
				<strong>{mode === 'full' ? 'Runs' : mode === 'fast' ? 'Does not run' : 'Also run on your machine'}</strong>
				<span>browser, completion-matrix, boxes-bundler, boxes-router, boxes-music-player, boxes-music-player-ssr, receipts, package-manager-matrix</span>
			</li>
			<li data-on={mode === 'ci' ? 'yes' : 'no'}>
				<strong>{mode === 'ci' ? 'Run only on CI' : 'Never runs here'}</strong>
				<span>benchmark, benchmark-guard</span>
			</li>
		</ul>
		<p class="explorer-note">
			{mode === 'fast'
				? 'Three jobs. This is the default, so plain pnpm ci:local runs the same three.'
				: mode === 'full'
					? 'Eleven jobs. Five need Playwright Chromium, and package-manager-matrix needs bun, deno and corepack. A job whose tools are missing is skipped with a note.'
					: 'CI runs on pull requests and on pushes to main. The two benchmark jobs run only when the changes job says a benchmark can be affected.'}
		</p>
		<style>
			section, button, code {
				font-variant-ligatures: none;
				font-feature-settings: 'calt' 0, 'liga' 0;
			}

			ul {
				display: grid;
				gap: 0.4em;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			li {
				display: grid;
				gap: 0.1em;
				padding: 0.4em 0.6em;
				border: 2px dashed color-mix(in oklch, var(--ink) 40%, var(--paper));
				opacity: 0.7;
			}

			li[data-on='yes'] {
				border: 2px solid var(--ink);
				background: var(--green-soft);
				color: var(--on-accent);
				opacity: 1;
			}

			span {
				font-family: var(--font-mono);
				font-size: var(--step--1);
				overflow-wrap: anywhere;
			}

			button[aria-pressed='true'] {
				background: var(--yellow);
			}
		</style>
	</section>
}
