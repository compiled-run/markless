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
		data-layout="split"
		onPointerover={(event) => boot(event, files)}
		onFocusin={(event) => boot(event, files)}
	>
		<header class="bar">
			<span class="title">{title ?? 'Playground'}</span>
			<div class="tools" role="toolbar" aria-label="Playground tools">
				<button type="button" class="tool" data-code-action="reset" aria-label="Reset code" data-tip="Reset code">
					<lucide.rotateccw aria-hidden="true" />
				</button>
				<button type="button" class="tool layout-tool" data-code-action="layout" aria-label="Stack code above result" aria-pressed="false" data-tip="Stack code above result">
					<lucide.rows2 class="when-split" aria-hidden="true" />
					<lucide.columns2 class="when-stacked" aria-hidden="true" />
				</button>
				<button type="button" class="tool" data-code-action="fullscreen" aria-label="Full screen" aria-pressed="false" data-tip="Full screen">
					<lucide.maximize2 class="when-normal" aria-hidden="true" />
					<lucide.minimize2 class="when-full" aria-hidden="true" />
				</button>
			</div>
		</header>
		<div class="body">
			<div class="source">
				<CodeFiles panes={panes} />
			</div>
			<div class="result" data-code-result>
				<div class="result-head">
					<span class="result-tab">Result</span>
					<span class="status" data-code-status role="status"></span>
				</div>
				<div class="stage-wrap">
					<div class="stage code-stage" data-code-stage>{children}</div>
					<ul class="problems" data-code-problems hidden aria-label="Problems"></ul>
				</div>
			</div>
		</div>
		@if (note) {
			<figcaption class="note"><span class="try">Try this</span> {note}</figcaption>;
		}
		<style>
			.code-block {
				--code-band: color-mix(in oklch, var(--ink) 80%, transparent);
				--code-wash: color-mix(in srgb, var(--purple) 26%, var(--paper));
				--code-tip-shadow: color-mix(in srgb, var(--purple) 45%, var(--paper));
				--code-head: 2.6rem;
				--code-gutter: 3.1rem;
				--code-gutter-ink: var(--muted-ink);
				--code-max-height: 26rem;
				--code-selection: color-mix(in oklch, var(--yellow) 55%, transparent);
				--code-problem: oklch(52% 0.19 20);
				--code-problem-wash: color-mix(in oklch, var(--pink) 18%, transparent);
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
					--code-tip-shadow: color-mix(in srgb, var(--purple) 42%, var(--paper));
					--code-selection: color-mix(in oklch, var(--yellow) 28%, transparent);
					--code-problem: oklch(76% 0.14 15);
					--code-problem-wash: color-mix(in oklch, var(--pink) 13%, transparent);
				}
			}

			.bar {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: var(--space-xs);
				padding: 0.45rem 0.6rem 0.45rem var(--space-s);
				border-bottom: 1px solid var(--code-band);
				border-radius: 12.5px 12.5px 0 0;
			}

			.title {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				font-weight: 700;
				line-height: 1.2;
			}

			.tools {
				display: flex;
				gap: 0.35rem;
			}

			.tool {
				position: relative;
				display: grid;
				place-items: center;
				width: 2rem;
				height: 2rem;
				padding: 0;
				border: 0;
				border-radius: 6px;
				background: transparent;
				color: var(--ink);
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

			.tool::after {
				content: attr(data-tip);
				position: absolute;
				top: calc(100% + 0.45rem);
				right: 0;
				z-index: 30;
				width: max-content;
				padding: 0.3em 0.65em;
				border-radius: 6px;
				background: var(--slab);
				box-shadow: 3px 3px 0 var(--code-tip-shadow);
				color: var(--slab-ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.3;
				opacity: 0;
				pointer-events: none;
				transition: opacity 130ms ease;
			}

			.tool:hover::after {
				opacity: 1;
				transition-delay: 450ms;
			}

			.tool:focus-visible::after {
				opacity: 1;
			}

			.when-stacked,
			.when-full,
			.code-block[data-layout='stacked'] .when-split,
			.code-block[data-full] .when-normal {
				display: none;
			}

			.code-block[data-layout='stacked'] .when-stacked,
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
				border-bottom: 1px solid var(--code-band);
			}

			.result {
				display: flex;
				flex-direction: column;
				min-width: 0;
			}

			.result-head {
				display: flex;
				align-items: end;
				gap: 0.5rem;
				min-height: var(--code-head);
				box-sizing: border-box;
				padding-inline: 0.6rem;
				border-bottom: 1px solid var(--code-band);
			}

			.result-tab {
				position: relative;
				margin-block-end: -1px;
				padding: 0.5em 1em;
				border: 1px solid var(--code-band);
				border-block-end: 0;
				border-radius: 6px 6px 0 0;
				background: var(--code-wash);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				line-height: 1.55;
			}

			.status {
				flex: 1;
				align-self: center;
				text-align: end;
				color: var(--muted-ink);
			}

			.stage-wrap {
				flex: 1;
				padding: var(--space-s);
			}

			.problems {
				display: grid;
				gap: 0.5rem;
				margin: var(--space-xs) 0 0;
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
				padding: var(--space-xs) var(--space-s);
				border-top: 1px dashed var(--code-band);
				border-radius: 0 0 12.5px 12.5px;
				background: var(--tinted);
			}

			.try {
				margin-right: 0.35em;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
			}

			@container (min-width: 60rem) {
				.code-block[data-layout='split'] .body {
					grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
				}

				.code-block[data-layout='split'] .source {
					border-bottom: 0;
					border-inline-end: 1px solid var(--code-band);
				}
			}

			@container (max-width: 59.99rem) {
				.layout-tool {
					display: none;
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
			}

			@media (prefers-reduced-motion: reduce) {
				.tool,
				.tool::after {
					transition: none;
				}
			}
		</style>
	</figure>
}
