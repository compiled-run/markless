// No handlers here: in a component with its own handlers, tab trigger events resolve to those handlers instead.
import { tabs } from '@markless/ui';
import type { CodePane } from '../../tooling/code-blocks.ts';

export default function CodeFiles({
	panes,
	children,
}: {
	readonly panes: readonly CodePane[];
	/** Controls drawn at the end of the tab bar, such as Reset. */
	readonly children?: unknown;
}) @{
	<tabs.root class="files" value="first">
		<div class="bar">
			<tabs.list class="strip" aria-label="Files">
				<div class="strip-row" role="presentation">
					@for (const pane of panes; key pane.name) {
						<tabs.trigger class="tab" value={pane.tab} data-code-tab={pane.name}>{pane.name}</tabs.trigger>
					}
				</div>
			</tabs.list>
			{children}
		</div>
		@for (const pane of panes; key pane.name) {
			<tabs.content class="pane" value={pane.tab}>
				<div class="editor" data-code-file={pane.name}>
					<pre class="first-paint shiki" aria-label={pane.name}>
						@for (const line of pane.lines; key line.id) {
							<span class="line">
								@for (const run of line.runs; key run.id) {
									<span style={run.style}>{run.text}</span>
								}
							</span>
						}
					</pre>
				</div>
			</tabs.content>
		}
		<style>
	.bar {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: var(--space-xs);
		padding: 0.4rem 0.5rem 0;
		border-bottom: 1px solid var(--code-edge);
		background: var(--raised);
	}

	.strip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2em;
	}

	.tab {
		padding: 0.3em 0.75em;
		border: 0;
		border-radius: 6px 6px 0 0;
		background: transparent;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: var(--step--2);
		opacity: 0.65;
		cursor: pointer;
	}

	.tab[ui-selected] {
		background: var(--code-surface);
		opacity: 1;
		font-weight: 700;
		box-shadow: inset 0 -3px 0 var(--yellow);
	}

	.tab:focus-visible {
		outline: 2px solid var(--purple);
		outline-offset: 2px;
	}

	.editor {
		overflow: hidden;
	}

	.first-paint {
		margin: 0;
		padding: 0.75rem 0;
		font-family: var(--font-mono);
		font-size: var(--step--2);
		line-height: 1.6;
		counter-reset: code-line;
		tab-size: 2;
		max-height: 26rem;
		overflow: auto;
	}

	.line {
		position: relative;
		display: block;
		min-height: 1.6em;
		padding-inline: 3rem 0.75rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.line::before {
		content: counter(code-line);
		counter-increment: code-line;
		position: absolute;
		left: 0;
		width: 2.25rem;
		text-align: right;
		color: var(--code-comment);
	}
		</style>
	</tabs.root>
}
