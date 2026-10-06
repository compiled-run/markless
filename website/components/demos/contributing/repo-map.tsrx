import { state } from '@markless/core';

// Text bindings rather than a record lookup: a computed that reads a plain object
// is not in the chunk the click runs.
export default function RepoMap() @{
	let picked = state('compiler');

	<section class="explorer">
		<div class="playground-controls">
			<button type="button" class="pick" aria-pressed={picked === 'compiler' ? 'true' : 'false'} onClick={() => picked = 'compiler'}>compiler</button>
			<button type="button" class="pick" aria-pressed={picked === 'bundler' ? 'true' : 'false'} onClick={() => picked = 'bundler'}>bundler</button>
			<button type="button" class="pick" aria-pressed={picked === 'ts' ? 'true' : 'false'} onClick={() => picked = 'ts'}>typescript-plugin</button>
			<button type="button" class="pick" aria-pressed={picked === 'web' ? 'true' : 'false'} onClick={() => picked = 'web'}>web</button>
			<button type="button" class="pick" aria-pressed={picked === 'runtime' ? 'true' : 'false'} onClick={() => picked = 'runtime'}>runtime</button>
			<button type="button" class="pick" aria-pressed={picked === 'serializer' ? 'true' : 'false'} onClick={() => picked = 'serializer'}>serializer</button>
			<button type="button" class="pick" aria-pressed={picked === 'core' ? 'true' : 'false'} onClick={() => picked = 'core'}>core</button>
			<button type="button" class="pick" aria-pressed={picked === 'router' ? 'true' : 'false'} onClick={() => picked = 'router'}>router</button>
			<button type="button" class="pick" aria-pressed={picked === 'cli' ? 'true' : 'false'} onClick={() => picked = 'cli'}>cli</button>
			<button type="button" class="pick" aria-pressed={picked === 'vitest' ? 'true' : 'false'} onClick={() => picked = 'vitest'}>vitest-browser</button>
		</div>
		<p class="stage">
			{picked === 'compiler' || picked === 'bundler' || picked === 'ts'
				? 'Compile time'
				: picked === 'router' || picked === 'cli'
					? 'Multi-page apps'
					: picked === 'vitest'
						? 'Tools around the pipeline'
						: 'Render in any environment'}
		</p>
		<p class="playground-output">
			<code>
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
			</code>
		</p>
		<p class="explorer-note">
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
		</p>
		<dl class="edges">
			<dt>Imports</dt>
			<dd>
				{picked === 'compiler' || picked === 'runtime'
					? 'serializer'
					: picked === 'bundler'
						? 'compiler, serializer, web'
						: picked === 'ts'
							? 'compiler'
							: picked === 'web'
								? 'runtime, serializer'
								: picked === 'core'
									? 'web, bundler, router'
									: picked === 'router'
										? 'bundler, web'
										: picked === 'vitest'
											? 'core, web'
											: 'no other Markless package'}
			</dd>
			<dt>Imported by</dt>
			<dd>
				{picked === 'compiler'
					? 'bundler, typescript-plugin'
					: picked === 'bundler'
						? 'core, router'
						: picked === 'web'
							? 'bundler, core, router, vitest-browser'
							: picked === 'runtime'
								? 'web'
								: picked === 'serializer'
									? 'compiler, bundler, runtime, web'
									: picked === 'core'
										? 'vitest-browser, ui'
										: picked === 'router'
											? 'core'
											: 'no other Markless package'}
			</dd>
		</dl>
		<style>
			section, button, code {
				font-variant-ligatures: none;
				font-feature-settings: 'calt' 0, 'liga' 0;
			}

			.stage {
				margin: 0;
				font-size: var(--step--1);
				font-weight: 700;
				text-transform: uppercase;
				letter-spacing: 0.04em;
			}

			button[aria-pressed='true'] {
				background: var(--yellow);
			}

			dl {
				display: grid;
				grid-template-columns: max-content minmax(0, 1fr);
				gap: 0.2em var(--space-xs);
				margin: 0;
			}

			dt {
				font-weight: 700;
			}

			dd {
				margin: 0;
			}
		</style>
	</section>
}
