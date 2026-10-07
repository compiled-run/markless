// No handlers here: in a component with its own handlers, tab trigger events resolve to those handlers instead.
import { tabs } from '@markless/ui';
import type { CodePane } from '../../tooling/code-blocks.ts';

export default function CodeFiles({ panes }: { readonly panes: readonly CodePane[] }) @{
	<tabs.root class="files" value="first">
		<tabs.list class="strip" aria-label="Files">
			<div class="strip-row" role="presentation">
				@for (const pane of panes; key pane.name) {
					<tabs.trigger class="tab" value={pane.tab} data-code-tab={pane.name}>{pane.name}</tabs.trigger>
				}
			</div>
		</tabs.list>
		@for (const pane of panes; key pane.name) {
			<tabs.content class="pane" value={pane.tab}>
				<div class="editor" data-code-file={pane.name}>
					<div class="layers">
						<pre class="shiki highlight" aria-hidden="true">
							@for (const line of pane.lines; key line.id) {
								<span class="line">
									@for (const run of line.runs; key run.id) {
										<span style={run.style}>{run.text}</span>
									}
								</span>
							}
						</pre>
						<textarea
							class="input"
							readonly
							spellcheck="false"
							autocapitalize="off"
							aria-label={`${pane.name}, editable. Press Escape then Tab to leave the editor.`}
							data-code-input
						>{pane.code}</textarea>
					</div>
				</div>
			</tabs.content>
		}
		<style>
	.files {
		display: flex;
		flex-direction: column;
		min-width: 0;
		height: 100%;
	}

	.strip {
		display: flex;
		align-items: end;
		min-height: var(--code-head);
		box-sizing: border-box;
		padding-inline: 0.6rem;
		border-bottom: 1px solid var(--code-band);
	}

	.strip-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
	}

	.tab {
		margin-block-end: -1px;
		padding: 0.5em 1em;
		border: 1px solid var(--code-band);
		border-block-end: 0;
		border-radius: 6px 6px 0 0;
		background: var(--paper);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: var(--step--2);
		line-height: 1.55;
		cursor: pointer;
		transition: background-color 130ms ease;
	}

	.tab + .tab {
		margin-inline-start: -1px;
	}

	.tab:hover {
		background: color-mix(in oklch, var(--code-wash) 50%, var(--paper));
	}

	.tab[ui-selected] {
		background: var(--code-wash);
	}

	.tab:focus-visible {
		position: relative;
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.pane {
		flex: 1;
		min-height: 0;
	}

	.pane[hidden] {
		display: none;
	}

	.editor {
		max-height: var(--code-max-height);
		height: 100%;
		overflow: auto;
		background: var(--code-surface);
		scrollbar-width: thin;
	}

	.editor:focus-within {
		outline: 2px solid var(--ink);
		outline-offset: -5px;
	}

	.layers {
		display: grid;
		width: max-content;
		min-width: 100%;
		min-height: 100%;
		font-family: var(--font-mono);
		font-size: var(--step--2);
		line-height: 1.6;
		tab-size: 2;
		font-variant-ligatures: none;
		font-feature-settings:
			'liga' 0,
			'calt' 0;
	}

	.highlight,
	.input {
		grid-area: 1 / 1;
		box-sizing: border-box;
		margin: 0;
		padding: 0.85rem 1.35em 0.85rem 0;
		border: 0;
		border-radius: 0;
		font: inherit;
		letter-spacing: 0;
		tab-size: inherit;
		white-space: pre;
		overflow-wrap: normal;
	}

	.highlight {
		counter-reset: code-line;
		color: var(--ink);
		background: transparent;
		pointer-events: none;
	}

	.input {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 0;
		padding-inline-start: var(--code-gutter);
		overflow: hidden;
		resize: none;
		outline: none;
		background: transparent;
		color: transparent;
		caret-color: var(--ink);
		-webkit-text-fill-color: transparent;
	}

	.input::selection {
		background: var(--code-selection);
		-webkit-text-fill-color: transparent;
	}

	.input[readonly] {
		cursor: default;
	}

	.line {
		position: relative;
		display: block;
		min-height: 1lh;
		padding-inline-start: var(--code-gutter);
	}

	.line::before {
		content: counter(code-line);
		counter-increment: code-line;
		position: absolute;
		left: 0;
		width: calc(var(--code-gutter) - 1.1rem);
		text-align: right;
		color: var(--code-gutter-ink);
	}

	.line.problem {
		background: var(--code-problem-wash);
	}

	.line.problem::before {
		color: var(--code-problem);
		font-weight: 700;
	}

	.line.problem::after {
		content: attr(data-problem);
		margin-inline-start: 2.5ch;
		color: var(--code-problem);
	}

	@media (prefers-reduced-motion: reduce) {
		.tab {
			transition: none;
		}
	}
		</style>
	</tabs.root>
}
