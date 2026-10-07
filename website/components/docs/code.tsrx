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
		<span class="rings" aria-hidden="true"></span>
		<header class="bar">
			<span class="title">{title ?? 'Playground'}</span>
			<div class="tools" role="toolbar" aria-label="Playground tools">
				<button type="button" class="tool" data-code-action="reset" aria-label="Reset code" title="Reset code">
					<lucide.rotateccw aria-hidden="true" />
				</button>
				<button type="button" class="tool" data-code-action="lines" aria-label="Line numbers" aria-pressed="true" title="Line numbers">
					<lucide.hash aria-hidden="true" />
				</button>
				<button type="button" class="tool" data-code-action="edit" aria-label="Edit code" title="Edit code">
					<lucide.pencil aria-hidden="true" />
				</button>
				<button type="button" class="tool" data-code-action="fullscreen" aria-label="Full screen" aria-pressed="false" title="Full screen">
					<lucide.maximize class="when-normal" aria-hidden="true" />
					<lucide.minimize class="when-full" aria-hidden="true" />
				</button>
			</div>
		</header>
		<div class="body">
			<div class="source">
				<CodeFiles panes={panes} />
			</div>
			<div class="result" data-code-result>
				<span class="status" data-code-status role="status"></span>
				<div class="stage code-stage" data-code-stage>{children}</div>
				<ul class="problems" data-code-problems hidden aria-label="Problems"></ul>
			</div>
		</div>
		@if (note) {
			<figcaption class="note"><span class="try">Try this</span>{note}</figcaption>;
		}
		<style>
			.code-block {
				--code-band: color-mix(in oklch, var(--ink) 70%, transparent);
				--code-wash: color-mix(in srgb, var(--purple) 26%, var(--paper));
				--code-tab-back: color-mix(in oklch, var(--ink) 9%, var(--paper));
				--code-tab-h: 2.6rem;
				--code-tab-left: 2.6rem;
				--code-editor-surface: transparent;
				--code-gutter: 2.3rem;
				--code-gutter-ink: var(--muted-ink);
				--code-max-height: 26rem;
				--code-selection: color-mix(in oklch, var(--yellow) 55%, transparent);
				--code-problem: oklch(52% 0.19 20);
				--code-problem-wash: color-mix(in oklch, var(--pink) 18%, transparent);
				--code-inset: 1.1rem;
				container-type: inline-size;
				position: relative;
				display: flex;
				flex-direction: column;
				box-sizing: border-box;
				width: 100%;
				margin: calc(var(--space-l) + var(--code-tab-h)) 0 var(--space-l);
				padding: 0.25rem var(--code-inset) 0.4rem 2.4rem;
				border: 1.5px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				box-shadow: 6px 6px 0 color-mix(in oklch, var(--ink) 22%, transparent);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;

				html.dark & {
					--code-wash: color-mix(in srgb, var(--purple) 20%, var(--paper));
					--code-tab-back: color-mix(in oklch, var(--ink) 12%, var(--paper));
					--code-selection: color-mix(in oklch, var(--yellow) 28%, transparent);
					--code-problem: oklch(76% 0.14 15);
					--code-problem-wash: color-mix(in oklch, var(--pink) 13%, transparent);
				}
			}

			.code-block[data-lines='off'] {
				--code-gutter: 1rem;
				--code-numbers: none;
			}

			.rings {
				position: absolute;
				top: 0.6rem;
				bottom: 0.4rem;
				left: -0.95rem;
				width: 34px;
				background: var(--ink);
				mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2234%22%20height%3D%2232%22%3E%3Cellipse%20cx%3D%2225%22%20cy%3D%2215%22%20rx%3D%222.6%22%20ry%3D%222.4%22/%3E%3Cpath%20d%3D%22M25%2014.2C19%208.6%204.5%208.4%203.2%2013.6C2%2018.6%2015%2019.8%2024.6%2016.4%22%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-width%3D%223.2%22%20stroke-linecap%3D%22round%22/%3E%3C/svg%3E") 0 0 / 34px 32px space;
				pointer-events: none;
			}

			.bar {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: var(--space-xs);
				padding: 0.55rem 0 0.55rem 0.4rem;
				border-bottom: 1.5px dashed var(--code-band);
			}

			.title {
				font-size: var(--step-0);
				line-height: 1.2;
			}

			.tools {
				display: flex;
				align-items: center;
				gap: 0.35rem;
			}

			.tool {
				display: grid;
				place-items: center;
				width: 2.1rem;
				height: 2.1rem;
				padding: 0;
				border: 0;
				border-radius: 6px;
				background: transparent;
				color: var(--ink);
				cursor: pointer;
				transition: background-color 130ms ease;
			}

			.tool svg {
				width: 1.2rem;
				height: 1.2rem;
			}

			.tool:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.tool:active {
				background: var(--code-wash);
			}

			.tool[data-code-action='lines'][aria-pressed='false'] {
				color: var(--muted-ink);
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
				display: block;
			}

			.body {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				flex: 1;
				min-height: 0;
			}

			.source {
				min-width: 0;
				border-bottom: 1.5px dashed var(--code-band);
			}

			.result {
				position: relative;
				display: flex;
				flex-direction: column;
				gap: var(--space-xs);
				min-width: 0;
				padding: 0.9rem 0 0.9rem 1.1rem;
			}

			.status {
				position: absolute;
				top: 0.4rem;
				right: 0;
				color: var(--muted-ink);
				font-size: var(--step--2);
			}

			.problems {
				display: grid;
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

			.code-block[data-code='error'] .stage {
				opacity: 0.5;
			}

			.note {
				padding: 0.7rem 0 0.35rem 0.4rem;
				border-top: 1.5px dashed var(--code-band);
			}

			.try {
				margin-right: 0.6em;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
			}

			@container (min-width: 36rem) {
				.body {
					grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
				}

				.source {
					border-bottom: 0;
					border-inline-end: 1.5px dashed var(--code-band);
				}
			}

			.code-block:fullscreen,
			.code-block[data-expanded] {
				--code-max-height: none;
				--code-tab-top: 0.5rem;
				width: auto;
				margin: 0;
				padding-top: calc(var(--code-tab-h) + 0.75rem);
				border-radius: 0;
				box-shadow: none;
			}

			.code-block[data-expanded] {
				position: fixed;
				inset: 0;
				z-index: 100;
			}

			@media (max-width: 600px) {
				.code-block {
					--code-tab-left: 1.6rem;
					padding-left: 1.9rem;
				}

				.rings {
					left: -1.1rem;
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
