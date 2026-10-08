import type { CodePane } from '../../tooling/code-blocks.ts';
import type { CodeFile } from './code/protocol.ts';
import { lucide } from '@markless/ui';
import sessionUrl from 'virtual:code-session-url';
import CodeFiles from './code-files.tsrx';

// A URL the bundler cannot follow keeps the editor out of preloads.
function boot(event: { readonly target: unknown }, files: readonly CodeFile[]): void {
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
		onVisible={(event) => boot(event, files)}
		onFocusin={(event) => boot(event, files)}
	>
		<header class="bar">
			<span class="title">{title ?? 'Playground'}<span class="restored">(Restored)</span></span>
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
				--code-tab-h: 2.7rem;
				--code-tab-left: 2.3rem;
				--code-bleed: 0px;
				--code-font-size: clamp(0.78rem, 2cqi, 1.15rem);
				--code-editor-surface: transparent;
				--code-gutter: 2.9rem;
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
				width: calc(100% + var(--code-bleed));
				margin: calc(var(--space-s) + var(--code-tab-h)) 0 var(--space-l);
				padding: 0.25rem var(--code-inset) 0.4rem 2.6rem;
				border: 2px solid transparent;
				border-image: url('/notebook/frame.png') 34 47 50 72 / 24.3px 33.6px 35.7px 51.4px / 7.1px 14.3px 19.3px 17.9px round;
				background: var(--paper);
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

			.bar {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: var(--space-xs);
				padding: 0.35rem 0 0.35rem 0.4rem;
				border-bottom: 2px dashed var(--code-band);
			}

			.title {
				font-size: var(--step-1);
				line-height: 1.2;
			}

			.restored {
				display: none;
				margin-inline-start: 0.5em;
				color: var(--muted-ink);
				font-size: var(--step--1);
			}

			.code-block[data-restored] .restored {
				display: inline;
			}

			.tools {
				display: flex;
				align-items: center;
				gap: 0.35rem;
			}

			.tool {
				display: grid;
				place-items: center;
				width: 2.5rem;
				height: 2.5rem;
				padding: 0;
				border: 0;
				border-radius: 6px;
				background: transparent;
				color: var(--ink);
				cursor: pointer;
				transition: background-color 130ms ease;
			}

			.tool svg {
				width: 1.5rem;
				height: 1.5rem;
				stroke-width: 2.3;
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
				border-bottom: 2px dashed var(--code-band);
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
				padding: 0.7rem 0 0.55rem 0.4rem;
				font-size: var(--step--1);
				border-top: 2px dashed var(--code-band);
			}

			.try {
				margin-right: 0.7em;
				font-size: var(--step-1);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
			}

			@media (min-width: 96.01rem) {
				.code-block {
					--code-bleed: 4.2rem;
					margin-left: 0.8rem;
				}
			}

			@container (min-width: 36rem) {
				.body {
					grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
					min-height: 25.5rem;
				}

				.source {
					border-bottom: 0;
					border-inline-end: 2px dashed var(--code-band);
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
					padding-left: 2.2rem;
				}
			}

			html.dark .code-block {
				--paper: var(--raised);
				border-image-source: url('/notebook/frame-dark.png');
			}

			@media (prefers-reduced-motion: reduce) {
				.tool {
					transition: none;
				}
			}
		</style>
	</figure>
}
