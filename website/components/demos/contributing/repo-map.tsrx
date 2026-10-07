import { state } from '@markless/core';
import PreviewCard, { Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';

// Inline ternaries: a computed that reads a plain object is not in the chunk the click runs.
export default function RepoMap() @{
	let picked = state('compiler');

	<PreviewCard name="repo-map" label="The Markless packages and what each imports">
		<Controls title="Which package does what?" />
		<Stage>
			<div class="wrap">
				<div class="board" data-picked={picked} role="group" aria-label="Packages">
					<div class="group">
						<span class="group-name">Compile time</span>
						<div class="pkgs">
							<button type="button" class="pkg compiler" aria-pressed={picked === 'compiler' ? 'true' : 'false'} onClick={() => (picked = 'compiler')}>compiler</button>
							<button type="button" class="pkg bundler" aria-pressed={picked === 'bundler' ? 'true' : 'false'} onClick={() => (picked = 'bundler')}>bundler</button>
							<button type="button" class="pkg ts" aria-pressed={picked === 'ts' ? 'true' : 'false'} onClick={() => (picked = 'ts')}>typescript-plugin</button>
						</div>
					</div>
					<div class="group">
						<span class="group-name">Render anywhere</span>
						<div class="pkgs">
							<button type="button" class="pkg web" aria-pressed={picked === 'web' ? 'true' : 'false'} onClick={() => (picked = 'web')}>web</button>
							<button type="button" class="pkg runtime" aria-pressed={picked === 'runtime' ? 'true' : 'false'} onClick={() => (picked = 'runtime')}>runtime</button>
							<button type="button" class="pkg serializer" aria-pressed={picked === 'serializer' ? 'true' : 'false'} onClick={() => (picked = 'serializer')}>serializer</button>
							<button type="button" class="pkg core" aria-pressed={picked === 'core' ? 'true' : 'false'} onClick={() => (picked = 'core')}>core</button>
						</div>
					</div>
					<div class="group">
						<span class="group-name">Multi-page apps</span>
						<div class="pkgs">
							<button type="button" class="pkg router" aria-pressed={picked === 'router' ? 'true' : 'false'} onClick={() => (picked = 'router')}>router</button>
							<button type="button" class="pkg cli" aria-pressed={picked === 'cli' ? 'true' : 'false'} onClick={() => (picked = 'cli')}>cli</button>
						</div>
					</div>
					<div class="group">
						<span class="group-name">Tools</span>
						<div class="pkgs">
							<button type="button" class="pkg vitest" aria-pressed={picked === 'vitest' ? 'true' : 'false'} onClick={() => (picked = 'vitest')}>vitest-browser</button>
						</div>
					</div>
				</div>
				<div class="key" aria-hidden="true">
					<span class="swatch picked">picked</span>
					<span class="swatch uses">it imports</span>
					<span class="swatch used">imports it</span>
				</div>
			</div>
		</Stage>
		<Watch>
			<span class="said">
				<Mono>
					<span>
						{picked === 'compiler'
						? '@markless/compiler'
						: picked === 'bundler'
						? '@markless/bundler'
						: picked === 'ts'
						? '@markless/typescript-plugin'
						: picked === 'web'
						? '@markless/web'
						: picked === 'runtime'
						? '@markless/runtime'
						: picked === 'serializer'
						? '@markless/serializer'
						: picked === 'core'
						? '@markless/core'
						: picked === 'router'
						? '@markless/router'
						: picked === 'cli'
						? 'create-markless'
						: '@markless/vitest-browser'}
					</span>
				</Mono>
				{': '}
				{picked === 'compiler'
					? 'Reads each .tsrx file before your app runs and plans the state, the updates and the event code.'
					: picked === 'bundler'
					? 'Runs the compiler inside Vite or Rolldown, and packs the output for production.'
					: picked === 'ts'
					? 'Gives editors .tsrx completions and errors, and holds the checker behind pnpm run typecheck.'
					: picked === 'web'
					? 'Runs the compiled plan for the web: render() in a browser, renderToString() and renderToStream() for HTML.'
					: picked === 'runtime'
					? 'The state graph: reads, writes, computed values and the flush journal.'
					: picked === 'serializer'
					? 'Writes values down and defines the payload format that travels with server HTML.'
					: picked === 'core'
					? 'The one import for apps: state, computed, shared, element and storage, plus render and the plugins.'
					: picked === 'router'
					? 'File routes, client navigation and streaming, built on Nitro.'
					: picked === 'cli'
					? 'npm create markless. Its four starters all use the router.'
					: 'Renders components inside Vitest browser tests.'}
				{' Imports: '}
				{picked === 'compiler'
					? 'serializer'
					: picked === 'bundler'
					? 'compiler, serializer, web'
					: picked === 'ts'
					? 'compiler'
					: picked === 'web'
					? 'runtime, serializer'
					: picked === 'runtime'
					? 'serializer'
					: picked === 'serializer'
					? 'none'
					: picked === 'core'
					? 'web, bundler, router'
					: picked === 'router'
					? 'bundler, web'
					: picked === 'cli'
					? 'none'
					: 'core, web'}
				{'. Imported by: '}
				{picked === 'compiler'
					? 'bundler, typescript-plugin'
					: picked === 'bundler'
					? 'core, router'
					: picked === 'ts'
					? 'none'
					: picked === 'web'
					? 'bundler, core, router, vitest-browser'
					: picked === 'runtime'
					? 'web'
					: picked === 'serializer'
					? 'compiler, bundler, web, runtime'
					: picked === 'core'
					? 'vitest-browser, ui'
					: picked === 'router'
					? 'core'
					: picked === 'cli'
					? 'none'
					: 'none'}
				{'.'}
			</span>
		</Watch>
		<style>
			.said code span {
				font-family: var(--font-mono);
			}

			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.wrap {
				display: grid;
				gap: 1.25em;
				justify-items: center;
				width: 100%;
			}

			.board {
				display: grid;
				grid-template-columns: repeat(4, minmax(0, 1fr));
				gap: 1em;
				width: 100%;
			}

			.group {
				display: grid;
				align-content: start;
				gap: 0.5em;
			}

			.group-name {
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-weight: 700;
			}

			.pkgs {
				display: grid;
				gap: 0.45em;
			}

			.pkg {
				padding: 0.35em 0.6em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: 0.8em;
				line-height: 1.4;
				text-align: start;
				white-space: nowrap;
				cursor: pointer;
				transition: background 140ms ease;
			}

			.pkg:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.pkg:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}


			.board[data-picked='compiler'] .compiler {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}
			.board[data-picked='compiler'] :is(.serializer) {
				background: var(--mark);
				color: var(--on-mark);
			}
			.board[data-picked='compiler'] :is(.bundler, .ts) {
				border-style: dashed;
				text-decoration: underline dashed var(--pink);
				text-underline-offset: 0.2em;
			}
			.board[data-picked='bundler'] .bundler {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}
			.board[data-picked='bundler'] :is(.compiler, .serializer, .web) {
				background: var(--mark);
				color: var(--on-mark);
			}
			.board[data-picked='bundler'] :is(.core, .router) {
				border-style: dashed;
				text-decoration: underline dashed var(--pink);
				text-underline-offset: 0.2em;
			}
			.board[data-picked='ts'] .ts {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}
			.board[data-picked='ts'] :is(.compiler) {
				background: var(--mark);
				color: var(--on-mark);
			}
			.board[data-picked='web'] .web {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}
			.board[data-picked='web'] :is(.runtime, .serializer) {
				background: var(--mark);
				color: var(--on-mark);
			}
			.board[data-picked='web'] :is(.bundler, .core, .router, .vitest) {
				border-style: dashed;
				text-decoration: underline dashed var(--pink);
				text-underline-offset: 0.2em;
			}
			.board[data-picked='runtime'] .runtime {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}
			.board[data-picked='runtime'] :is(.serializer) {
				background: var(--mark);
				color: var(--on-mark);
			}
			.board[data-picked='runtime'] :is(.web) {
				border-style: dashed;
				text-decoration: underline dashed var(--pink);
				text-underline-offset: 0.2em;
			}
			.board[data-picked='serializer'] .serializer {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}
			.board[data-picked='serializer'] :is(.compiler, .bundler, .web, .runtime) {
				border-style: dashed;
				text-decoration: underline dashed var(--pink);
				text-underline-offset: 0.2em;
			}
			.board[data-picked='core'] .core {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}
			.board[data-picked='core'] :is(.web, .bundler, .router) {
				background: var(--mark);
				color: var(--on-mark);
			}
			.board[data-picked='core'] :is(.vitest) {
				border-style: dashed;
				text-decoration: underline dashed var(--pink);
				text-underline-offset: 0.2em;
			}
			.board[data-picked='router'] .router {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}
			.board[data-picked='router'] :is(.bundler, .web) {
				background: var(--mark);
				color: var(--on-mark);
			}
			.board[data-picked='router'] :is(.core) {
				border-style: dashed;
				text-decoration: underline dashed var(--pink);
				text-underline-offset: 0.2em;
			}
			.board[data-picked='cli'] .cli {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}
			.board[data-picked='vitest'] .vitest {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}
			.board[data-picked='vitest'] :is(.core, .web) {
				background: var(--mark);
				color: var(--on-mark);
			}

			.key {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5em 1.25em;
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.swatch {
				padding: 0 0.4em;
				border: 1px solid var(--ink);
				border-radius: 4px;
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.swatch.picked {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.swatch.uses {
				background: var(--mark);
				color: var(--on-mark);
			}

			.swatch.used {
				border-style: dashed;
				text-decoration: underline dashed var(--pink);
				text-underline-offset: 0.2em;
			}

			@media (max-width: 40rem) {
				.board {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.pkg {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
