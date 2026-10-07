// A code example the reader can edit and run. A page writes <Code> around titled
// fences; tooling/code-blocks.ts turns each block into a module that passes the files
// in and projects the starter, built by the site, as the Result pane's first paint.
import type { CodePane } from '../../tooling/code-blocks.ts';
import type { CodeFile } from './code/protocol.ts';
import { lucide } from '@markless/ui';
import sessionUrl from 'virtual:code-session-url';
import CodeFiles from './code-files.tsrx';

// A URL the bundler cannot follow keeps the editor out of preloads; the block is found from the target until onVisible works.
function boot(event: Event, files: readonly CodeFile[]): void {
	const box = (event.target as Element | null)?.closest<HTMLElement>('.code-block');
	if (box)
		void (import(/* @vite-ignore */ sessionUrl) as Promise<typeof import('./code/session.ts')>).then(
			(code) => code.bootCodeBlock(box, files),
		);
}

export default function Code({
	files,
	panes,
	title,
	note,
	children,
}: {
	/** The starter files, entry `.tsrx` first or not; Reset restores them. */
	readonly files: readonly CodeFile[];
	/** The files highlighted at build time, under the textareas the reader edits. */
	readonly panes: readonly CodePane[];
	/** The name in the block's header bar; `Playground` when not given. */
	readonly title?: string;
	/** A suggestion printed under the block, such as what to change and what to watch. */
	readonly note?: string;
	/** The starter's own render, shown in the Result pane until the first run. */
	readonly children?: unknown;
}) @{
	<figure
		class="code-block"
		data-code="idle"
		onPointerover={(event) => boot(event, files)}
		onFocusin={(event) => boot(event, files)}
	>
		<header class="bar">
			<span class="title">
				<span class="glyph" aria-hidden="true"><lucide.squareterminal /></span>
				{title ?? 'Playground'}
			</span>
			<div class="tools" role="toolbar" aria-label="Playground tools">
				<button type="button" class="tool" data-code-action="reset" aria-label="Reset code">
					<lucide.rotateccw aria-hidden="true" />
					<span>Reset</span>
				</button>
				<span class="sep" aria-hidden="true"></span>
				<button type="button" class="tool" data-code-action="fullscreen" aria-label="Full screen" aria-pressed="false">
					<lucide.maximize2 class="when-normal" aria-hidden="true" />
					<lucide.minimize2 class="when-full" aria-hidden="true" />
					<span class="when-normal">Expand</span>
					<span class="when-full">Close</span>
				</button>
			</div>
		</header>
		<div class="body">
			<div class="source">
				<CodeFiles panes={panes} />
			</div>
			<div class="result" data-code-result>
				<div class="result-head">
					<span class="result-label">Live preview</span>
					<span class="status" data-code-status role="status"></span>
					<span class="live" aria-hidden="true"><i></i>Live</span>
				</div>
				<div class="stage-wrap">
					<div class="sheet">
						<div class="stage code-stage" data-code-stage>{children}</div>
					</div>
					<ul class="problems" data-code-problems hidden aria-label="Problems"></ul>
				</div>
			</div>
		</div>
		@if (note) {
			<figcaption class="note"><span class="try">Try this</span><span class="note-text">{note}</span></figcaption>;
		}
		<style>
			.code-block {
				--code-band: color-mix(in oklch, var(--ink) 80%, transparent);
				--code-wash: color-mix(in srgb, var(--purple) 26%, var(--paper));
				--code-grid: color-mix(in srgb, var(--purple) 30%, transparent);
				--code-grid-fill: color-mix(in srgb, var(--purple) 9%, var(--paper));
				--code-head: 2.6rem;
				--code-gutter: 3.1rem;
				--code-gutter-ink: var(--muted-ink);
				--code-max-height: 26rem;
				--code-selection: color-mix(in oklch, var(--yellow) 55%, transparent);
				--code-problem: oklch(52% 0.19 20);
				--code-problem-wash: color-mix(in oklch, var(--pink) 18%, transparent);
				--code-live: oklch(62% 0.15 150);
				container-type: inline-size;
				position: relative;
				display: flex;
				flex-direction: column;
				box-sizing: border-box;
				width: 100%;
				margin: var(--space-l) 0;
				border: 1.5px solid var(--ink);
				border-radius: 14px;
				background: var(--paper);
				box-shadow: 7px 7px 0 var(--muted-ink);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;

				html.dark & {
					--code-wash: color-mix(in srgb, var(--purple) 20%, var(--paper));
					--code-grid: color-mix(in srgb, var(--purple) 22%, transparent);
					--code-grid-fill: color-mix(in srgb, var(--purple) 6%, var(--paper));
					--code-selection: color-mix(in oklch, var(--yellow) 28%, transparent);
					--code-problem: oklch(76% 0.14 15);
					--code-problem-wash: color-mix(in oklch, var(--pink) 13%, transparent);
					--code-live: oklch(74% 0.15 150);
				}
			}

			.bar {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: var(--space-xs);
				padding: 0.5rem 0.75rem 0.5rem var(--space-s);
				border-bottom: 1px solid var(--code-band);
				border-radius: 12.5px 12.5px 0 0;
			}

			.title {
				display: flex;
				align-items: center;
				gap: 0.6rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				font-weight: 700;
				line-height: 1.2;
			}

			.glyph {
				display: grid;
				place-items: center;
				width: 1.9rem;
				height: 1.9rem;
				border: 1.5px solid var(--ink);
				border-radius: 6px;
			}

			.glyph svg {
				width: 1.15rem;
				height: 1.15rem;
			}

			.tools {
				display: flex;
				align-items: center;
				gap: 0.25rem;
			}

			.sep {
				width: 1px;
				height: 1.3rem;
				background: var(--code-band);
			}

			.tool {
				display: inline-flex;
				align-items: center;
				gap: 0.4rem;
				padding: 0.35rem 0.55rem;
				border: 0;
				border-radius: 6px;
				background: transparent;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				cursor: pointer;
				transition: background-color 130ms ease;
			}

			.tool svg {
				width: 1.05rem;
				height: 1.05rem;
			}

			.tool:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.tool:active,
			.tool[aria-pressed='true'] {
				background: var(--code-wash);
			}

			.tool:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			.when-full,
			.code-block[data-full] .when-normal {
				display: none;
			}

			.code-block[data-full] .when-full {
				display: inline;
			}

			.body {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				flex: 1;
				min-height: 0;
			}

			.source {
				min-width: 0;
				border-bottom: 1px solid var(--code-band);
			}

			.result {
				display: flex;
				flex-direction: column;
				min-width: 0;
			}

			.result-head {
				display: flex;
				align-items: center;
				justify-content: flex-end;
				gap: 0.9rem;
				min-height: var(--code-head);
				box-sizing: border-box;
				padding-inline: var(--space-s);
				border-bottom: 1px solid var(--code-band);
			}

			.result-label {
				color: var(--muted-ink);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				letter-spacing: 0.12em;
				text-transform: uppercase;
			}

			.live {
				display: inline-flex;
				align-items: center;
				gap: 0.4rem;
				font-size: var(--step--1);
			}

			.live i {
				width: 0.7rem;
				height: 0.7rem;
				border: 1.5px solid var(--ink);
				border-radius: 50%;
				background: var(--code-live);
			}

			.status:empty {
				display: none;
			}

			.status {
				color: var(--muted-ink);
			}

			.code-block:is([data-code='running'], [data-code='error']) .live {
				display: none;
			}

			.stage-wrap {
				display: flex;
				flex: 1;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: var(--space-xs);
				padding: var(--space-m) var(--space-s);
				background-color: var(--code-grid-fill);
				background-image:
					linear-gradient(var(--code-grid) 1px, transparent 1px),
					linear-gradient(90deg, var(--code-grid) 1px, transparent 1px);
				background-size: 1.25rem 1.25rem;
			}

			.sheet {
				box-sizing: border-box;
				min-width: min(100%, 14rem);
				max-width: 100%;
				padding: var(--space-s) var(--space-m);
				border: 1.5px solid var(--ink);
				border-radius: 10px;
				background: var(--paper);
				box-shadow: 4px 4px 0 var(--muted-ink);
			}

			.sheet:has(> .code-frame:not([hidden])) {
				align-self: stretch;
			}

			.problems {
				display: grid;
				align-self: stretch;
				gap: 0.5rem;
				margin: 0;
				padding: 0.6rem 0.75rem;
				list-style: none;
				border-left: 4px solid var(--code-problem);
				border-radius: 0 6px 6px 0;
				background: var(--code-problem-wash);
				line-height: 1.45;
			}

			.problems[hidden] {
				display: none;
			}

			.code-block[data-code='error'] .sheet {
				opacity: 0.5;
			}

			.note {
				display: flex;
				align-items: baseline;
				gap: 0.9rem;
				padding: var(--space-xs) var(--space-s);
				border-top: 1px dashed var(--code-band);
				border-radius: 0 0 12.5px 12.5px;
				background: var(--tinted);
			}

			.try {
				flex: none;
				padding-right: 0.9rem;
				border-right: 1px solid var(--code-band);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
			}

			@container (min-width: 40rem) {
				.body {
					grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
				}

				.source {
					border-bottom: 0;
					border-inline-end: 1px solid var(--code-band);
				}
			}

			.code-block:fullscreen,
			.code-block[data-expanded] {
				--code-max-height: none;
				width: auto;
				margin: 0;
				border: 0;
				border-radius: 0;
				box-shadow: none;
			}

			.code-block[data-expanded] {
				position: fixed;
				inset: 0;
				z-index: 100;
			}

			.code-block[data-full] .bar,
			.code-block[data-full] .note {
				border-radius: 0;
			}

			@media (max-width: 600px) {
				.code-block {
					border-radius: 10px;
					box-shadow: 4px 4px 0 var(--muted-ink);
				}

				.bar {
					border-radius: 8.5px 8.5px 0 0;
				}

				.note {
					border-radius: 0 0 8.5px 8.5px;
				}

				.tool span {
					display: none;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.tool {
					transition: none;
				}
			}
		</style>
	</figure>
}
