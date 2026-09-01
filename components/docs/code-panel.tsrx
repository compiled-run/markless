// The code under a demo: one pane per file the demo is made of, clipped to a
// few lines until a reader asks for the rest.
//
// `panes` is not written by hand. A page names a demo — `<CodePanel
// scenario="accordion/basic" />` — and `tooling/ui-demos.ts` fills the panes in
// at build time, because @markless/router's MDX transform takes default imports
// from `.tsrx` files only and a page therefore cannot import the data itself.
//
// The tab strip is the tabs family and the expand mechanism is the collapsible
// family, both from @markless/ui: the docs run on the components they document.
// The code itself is spans carrying shiki's own colours, the same convention the
// front page's hero card uses, because the highlighter's output is HTML and
// Markless has no way to drop a string of HTML into a component.
import { collapsible, tabs } from '@markless/ui';
import type { CodePane } from '../../tooling/ui-demos.ts';

export default function CodePanel({
	panes,
	scenario,
}: {
	readonly panes?: readonly CodePane[];
	/** `family/demo`, the demo whose code this is. Read by the build, not here. */
	readonly scenario?: string;
}) @{
	const list = panes ?? [];

	// The file's own pane is always the first one the build emits, and the tab
	// showing on arrival has to be a value the compiler can see, not a lookup.
	<div class="code-panel" data-scenario={scenario}>
		<tabs.root class="panel" value="source">
			<tabs.list class="strip">
				{/* A repeat is a child of a host element, never of a component, so the
				    tabs sit in a wrapper. `presentation` keeps the tablist the owner
				    of its tabs in the accessibility tree. */}
				<div class="strip-row" role="presentation">
					@for (const pane of list; key pane.value) {
						<tabs.trigger class="tab" value={pane.value}>{pane.label}</tabs.trigger>
					}
				</div>
			</tabs.list>
			<div class="panes">
				@for (const pane of list; key pane.value) {
					<tabs.content class="pane" value={pane.value}>
						<collapsible.root class="clamp">
							<div class="code">
								<pre class="shiki">
									@for (const line of pane.lines; key line.id) {
										<span class="line">
											@for (const token of line.tokens; key token.id) {
												{/* The two repeats need a host element over them, and only one of
												    them has anything in it: `@if` hangs this build. */}
												<span class="run">
													@for (const run of token.plain; key run.id) {
														<span style={run.style}>{run.text}</span>
													}
													@for (const run of token.hover; key run.id) {
														<span class="tsrx-hover" tabindex="0" role="img" aria-label={run.label} data-doc-title={run.title} data-doc={run.doc}><span style={run.style}>{run.text}</span><span class="tsrx-tip" aria-hidden="true"><span class="tsrx-tip-title">{run.title}</span><span class="tsrx-tip-body">{run.doc}</span></span></span>
													}
												</span>
											}
										</span>
									}
								</pre>
							</div>
							<span class="fade" aria-hidden="true"></span>
							<collapsible.trigger class="expand">Expand code</collapsible.trigger>
						</collapsible.root>
					</tabs.content>
				}
			</div>
		</tabs.root>

		<style>
			.code-panel {
				margin-block: var(--space-m);
			}

			.panel {
				border: 1px solid var(--code-edge);
				border-radius: 8px;
				background: var(--raised);
				overflow: clip;
			}

			.strip {
				padding: 0.35em 0.5em 0;
				border-bottom: 1px solid var(--code-edge);
			}

			.strip-row {
				display: flex;
				gap: 0.2em;
			}

			.tab {
				padding: 0.25em 0.75em;
				border: 0;
				border-radius: 6px 6px 0 0;
				background: transparent;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				opacity: 0.6;
				cursor: pointer;
			}

			.tab[ui-selected] {
				background: var(--paper);
				opacity: 1;
				font-weight: 700;
			}

			/* The clamp: the code always shows, and opening only lifts the ceiling.
			   A gradient element rather than ::after — the scoped-style transform
			   appends its class after the selector, so a pseudo-element selector
			   would emit invalid CSS. */
			.clamp {
				position: relative;
			}

			.code {
				max-height: 150px;
				overflow: clip;
			}

			.clamp[ui-open] .code {
				max-height: none;
				overflow: visible;
			}

			pre {
				margin: 0;
				padding: var(--space-s);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				line-height: 160%;
				overflow-x: auto;
			}

			.line {
				display: block;
				white-space: pre;
			}

			.fade {
				position: absolute;
				inset-inline: 0;
				bottom: 0;
				height: 5rem;
				background: linear-gradient(to bottom, transparent, var(--raised) 70%);
				pointer-events: none;
			}

			/* The whole faded strip is the target, so a reader can click the code
			   they cannot read yet rather than hunting for a small control. */
			.expand {
				position: absolute;
				inset-inline: 0;
				bottom: 0;
				height: 5rem;
				display: flex;
				align-items: flex-end;
				justify-content: center;
				padding-bottom: 0.6em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-size: var(--step--1);
				font-weight: 700;
				cursor: pointer;
			}

			.clamp[ui-open] .fade,
			.clamp[ui-open] .expand {
				display: none;
			}
		</style>
	</div>
}
