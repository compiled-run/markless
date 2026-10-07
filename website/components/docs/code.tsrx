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
	skin,
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
	/** `image` draws the notebook from layers cut out of the reference art; the default draws it in CSS. */
	readonly skin?: 'drawn' | 'image';
	/** The starter's own render, shown in the Result pane until the first run. */
	readonly children?: unknown;
}) @{
	<figure
		class="code-block"
		data-skin={skin ?? 'drawn'}
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
				border: 2px solid var(--ink);
				border-radius: 12px 15px 13px 16px / 10px 12px 14px 18px;
				background: var(--paper);
				box-shadow: 1px 3px 0 var(--paper), 0 5px 0 -1px var(--ink),
					3px 7px 0 -2px color-mix(in oklch, var(--ink) 55%, var(--paper)),
					9px 12px 0 color-mix(in oklch, var(--ink) 24%, transparent);
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
				top: 0.35rem;
				bottom: 0.65rem;
				left: -18px;
				width: 40px;
				pointer-events: none;
				background: var(--ink);
				mask: url('/notebook-holes.svg') 0 0 / 40px 34px space;
			}

			.rings::before,
			.rings::after {
				content: '';
				position: absolute;
				inset: 0;
				mask: url('/notebook-wire.svg') 0 0 / 40px 34px space;
				background: color-mix(in oklch, var(--ink) 85%, var(--paper));
			}

			.rings::after {
				mask-image: url('/notebook-sheen.svg');
				background: color-mix(in oklch, var(--paper) 80%, var(--ink));
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
					padding-left: 1.9rem;
				}

				.rings {
					left: -1.1rem;
				}
			}

			.code-block[data-skin='image'] {
				--code-tab-left: 35px;
				border-color: transparent;
				box-shadow: none;
			}

			.code-block[data-skin='image']::before {
				content: '';
				position: absolute;
				inset: -9px -13px -16px -19px;
				pointer-events: none;
				background:
					url('/notebook/tl.png') left top / 56px 50px no-repeat,
					url('/notebook/tr.png') right top / 42px 32px no-repeat,
					url('/notebook/bl.png') left bottom / 64px 32px no-repeat,
					url('/notebook/br.png') right bottom / 42px 32px no-repeat,
					url('/notebook/top.png') 56px top / calc(100% - 98px) 32px no-repeat,
					url('/notebook/bottom.png') 64px bottom / calc(100% - 106px) 32px no-repeat,
					url('/notebook/right.png') right 32px / 32px calc(100% - 64px) no-repeat;
			}

			.code-block[data-skin='image'] .rings {
				top: 41px;
				bottom: 16px;
				left: -19px;
				width: 50px;
				background: url('/notebook/coil.png') 0 0 / 50px 34px no-repeat round;
			}

			.code-block[data-skin='image'] .rings::before,
			.code-block[data-skin='image'] .rings::after {
				display: none;
			}

			html.dark .code-block[data-skin='image']::before,
			html.dark .code-block[data-skin='image'] .rings {
				filter: invert(1) hue-rotate(180deg);
			}

			@media (prefers-reduced-motion: reduce) {
				.tool {
					transition: none;
				}
			}
		</style>
	</figure>
}
