// A code example the reader can edit and run. A page writes <Code> around titled
// fences; tooling/code-blocks.ts turns each block into a module that passes the files
// in and projects the starter, built by the site, as the Result pane's first paint.
// The editor, the result frame and the compiler load on the first point, focus or edit.
import type { CodePane } from '../../tooling/code-blocks.ts';
import type { CodeFile } from './code/protocol.ts';
import type { CodeSession } from './code/session.ts';
import sessionUrl from 'virtual:code-session-url';
import MarkerSweep from '../sketch/marker-sweep.tsrx';
import CodeFiles from './code-files.tsrx';

// An import the bundler cannot follow, so the editor is not among the page's preloads.
// The block is found from the event target: an element() handle shared by two blocks on one
// MDX page cannot be read from its own handler today.
function session(event: Event, files: readonly CodeFile[]): Promise<CodeSession | undefined> {
	const box = (event.target as Element | null)?.closest<HTMLElement>('.code-block') ?? undefined;
	if (!box) return Promise.resolve(undefined);
	return (import(/* @vite-ignore */ sessionUrl) as Promise<typeof import('./code/session.ts')>).then((code) =>
		code.codeSession(box, files),
	);
}

export default function Code({
	files,
	panes,
	note,
	children,
}: {
	/** The starter files, entry `.tsrx` first or not; Reset restores them. */
	readonly files: readonly CodeFile[];
	/** The files highlighted at build time, drawn until the editor loads. */
	readonly panes: readonly CodePane[];
	/** A suggestion printed under the block, such as what to change and what to watch. */
	readonly note?: string;
	/** The starter's own render, shown in the Result pane until the first edit. */
	readonly children?: unknown;
}) @{
	<figure
		class="code-block"
		data-code="idle"
		onPointerover={(event) => void session(event, files)}
		onFocusin={(event) => void session(event, files)}
	>
		<div class="source">
			<CodeFiles panes={panes}>
				<button
					type="button"
					class="reset"
					onClick={(event) => void session(event, files).then((live) => live?.reset())}
				>
					Reset
				</button>
			</CodeFiles>
		</div>
		<div class="result" data-code-result>
			<p class="result-head">
				<span class="result-label" data-code-marker>
					Result
					<MarkerSweep beat="rest" tone="yellow" place="" />
				</span>
				<span class="status" data-code-status role="status"></span>
			</p>
			<div class="stage code-stage" data-code-stage>{children}</div>
			<ul class="problems" data-code-problems hidden aria-label="Problems"></ul>
		</div>
		@if (note) {
			<figcaption class="note"><span class="try">Try this</span> {note}</figcaption>;
		}
		<style>
			.code-block {
				--code-keyword: #d73a49;
				--code-string: #032f62;
				--code-function: #6f42c1;
				--code-constant: #005cc5;
				--code-tag: #22863a;
				--code-comment: #6a737d;
				--code-selection: color-mix(in oklch, var(--yellow) 55%, transparent);
				--code-problem: oklch(55% 0.2 20);
				--code-problem-wash: color-mix(in oklch, var(--pink) 18%, transparent);
				margin: var(--space-l) 0;
				border: 2px solid var(--ink);
				border-radius: 2px;
				background: var(--raised);
				box-shadow: 4px 4px 0 var(--purple);

				html.dark & {
					--code-keyword: #f97583;
					--code-string: #9ecbff;
					--code-function: #b392f0;
					--code-constant: #79b8ff;
					--code-tag: #85e89d;
					--code-comment: #959da5;
					--code-selection: color-mix(in oklch, var(--yellow) 30%, transparent);
					--code-problem: oklch(72% 0.17 15);
				}
			}

			.source {
				border-bottom: 2px solid var(--ink);
				background: var(--code-surface);
			}

			.reset:focus-visible {
				outline: 2px solid var(--purple);
				outline-offset: 2px;
			}

			.reset {
				margin-block-end: 0.4rem;
				padding: 0.15em 0.75em;
				border: 2px solid var(--ink);
				border-radius: 2px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				box-shadow: 2px 2px 0 var(--ink);
				cursor: pointer;
			}

			.reset:active {
				transform: translate(2px, 2px);
				box-shadow: none;
			}

			.result {
				padding: var(--space-xs) var(--space-s) var(--space-s);
			}

			.result-head {
				display: flex;
				align-items: baseline;
				justify-content: space-between;
				margin: 0 0 var(--space-xs);
			}

			.result-label {
				position: relative;
				display: inline-block;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				font-weight: 700;
			}

			.status {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				opacity: 0.75;
			}

			.problems {
				display: grid;
				gap: 0.5rem;
				margin: var(--space-xs) 0 0;
				padding: 0.6rem 0.75rem;
				list-style: none;
				border-left: 4px solid var(--code-problem);
				background: var(--code-problem-wash);
				font-size: var(--step--1);
				line-height: 1.45;
			}

			.problems[hidden] {
				display: none;
			}

			.code-block[data-code='error'] .stage,
			.code-block[data-code='error'] .result-label {
				opacity: 0.5;
			}

			.note {
				padding: var(--space-xs) var(--space-s);
				border-top: 2px dashed var(--code-edge);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
			}

			.try {
				margin-right: 0.35em;
				padding: 0 0.3em;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
				background: linear-gradient(transparent 45%, var(--mark) 45%, var(--mark) 90%, transparent 90%);
				color: var(--on-mark);
			}

			@media (max-width: 30rem) {
				.code-block {
					margin-inline: calc(-0.5 * var(--space-xs));
					box-shadow: 3px 3px 0 var(--purple);
				}
			}
		</style>
	</figure>
}
