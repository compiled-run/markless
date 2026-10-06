import { state } from '@markless/core';

// A drawing of an editor, not a real one: the hint, the red line and the menu are the plugin's real output.
export default function EditorView() @{
	let extension = state(false);
	let plugin = state(false);

	<section class="explorer">
		<div class="playground-controls">
			<button
				type="button"
				class="pick"
				aria-pressed={extension ? 'true' : 'false'}
				onClick={() => (extension = !extension)}
			>
				{extension ? 'Extension: on' : 'Extension: off'}
			</button>
			<button
				type="button"
				class="pick"
				aria-pressed={plugin ? 'true' : 'false'}
				onClick={() => (plugin = !plugin)}
			>
				{plugin ? 'Plugin: on' : 'Plugin: off'}
			</button>
		</div>
		<div class={extension ? 'editor coloured' : 'editor'}>
			<p class="tab">Menu.tsrx</p>
			<pre>
				<span class="row">
					<span class="k">import</span> {'{ '}
					<span class="f">state</span>
					{' } '}
					<span class="k">from</span> <span class="s">'@markless/core'</span>;
				</span>
				<span class="row">
					<span class="k">import</span> * <span class="k">as</span> widget{' '}
					<span class="k">from</span> <span class="s">'./widget.tsrx'</span>;
				</span>
				<span class="row"> </span>
				<span class="row">
					<span class="k">export function</span> <span class="f">Menu</span>(){' '}
					<span class="k">{'@'}</span>
					{'{'}
				</span>
				<span class="row">
					{'\t'}
					<span class="k">let</span> count = <span class="f">state</span>(0);
				</span>
				<span class="row"> </span>
				<span class="row">
					{'\t'}
					<span class="t">{'<widget.trigger'}</span>
					<span class="hint" hidden={!plugin}>
						: button
					</span>{' '}
					<span class="a">value</span>=<span class="s">"go"</span>
					<span class="t">{'>'}</span>Go<span class="t">{'</widget.trigger>'}</span>
				</span>
				<span class="row">
					{'\t'}
					<span class="t">{'<button'}</span>{' '}
					<span class={plugin ? 'a squiggle' : 'a'}>onClik</span>={'{() => count++}'}
					<span class="t">{'>'}</span>Add<span class="t">{'</button>'}</span>
				</span>
				<span class="row">
					{'\t'}
					<span class="k">{'@'}</span>
					<span class="caret" aria-hidden="true"></span>
				</span>
				<span class="row">{'}'}</span>
			</pre>
			<div class="popups" hidden={!plugin}>
				<p class="problem">
					Property 'onClik' does not exist on type '…'. Did you mean 'onClick'?
				</p>
				<ul class="menu" aria-label="Suggestions after @">
					<li>{'@if'}</li>
					<li>{'@if-@else'}</li>
					<li>{'@for-of'}</li>
					<li>{'@for-key'}</li>
					<li>{'@try-@pending'}</li>
				</ul>
			</div>
		</div>
		<p class="explorer-note">
			{extension && plugin
				? 'Colours from the extension. The hint, the red line and the @ menu come from the plugin.'
				: extension
					? 'The extension knows TSRX syntax, so the file has colours. It knows nothing about Markless.'
					: plugin
						? 'The plugin already gives hints, errors and suggestions. Colours still need the extension.'
						: 'Plain grey text. The editor does not know what a .tsrx file is.'}
		</p>

		<style>
			.pick {
				color: var(--ink);
			}

			button[aria-pressed='true'] {
				background: var(--yellow);
				color: var(--on-accent);
			}

			.editor {
				border: 2px solid var(--ink);
				background: var(--code-surface);
				font-family: var(--font-mono);
				font-size: var(--step--1);
			}

			.tab {
				margin: 0;
				padding: 0.3em 0.8em;
				border-bottom: 1px solid var(--code-edge);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				opacity: 0.8;
			}

			pre {
				margin: 0;
				padding: var(--space-xs);
				overflow-x: auto;
				border: 0;
				background: none;
				color: color-mix(in oklch, var(--ink) 55%, var(--code-surface));
				line-height: 1.6;
				tab-size: 2;
			}

			pre,
			pre span {
				font-family: var(--font-mono);
			}

			.row {
				display: block;
				white-space: pre;
			}

			.coloured pre {
				color: var(--ink);
			}

			.coloured .k {
				color: #d73a49;

				html.dark & {
					color: #f97583;
				}
			}

			.coloured .s {
				color: #032f62;

				html.dark & {
					color: #9ecbff;
				}
			}

			.coloured .f {
				color: #6f42c1;

				html.dark & {
					color: #b392f0;
				}
			}

			.coloured .t {
				color: #22863a;

				html.dark & {
					color: #85e89d;
				}
			}

			.coloured .a {
				color: #005cc5;

				html.dark & {
					color: #79b8ff;
				}
			}

			.hint {
				margin-inline: 0.2em;
				padding: 0 0.3em;
				border-radius: 3px;
				background: var(--code-edge);
				color: var(--ink);
				font-size: 0.85em;
				opacity: 0.8;
			}

			.squiggle {
				text-decoration: underline wavy #d1242f;
				text-underline-offset: 0.2em;
			}

			.caret {
				display: inline-block;
				width: 2px;
				height: 1.1em;
				vertical-align: text-bottom;
				background: var(--ink);
			}

			.popups:not([hidden]) {
				display: flex;
				flex-wrap: wrap;
				gap: var(--space-xs);
				padding: 0 var(--space-xs) var(--space-xs);
			}

			.problem {
				flex: 1 1 16rem;
				align-self: flex-start;
				margin: 0;
				padding: 0.4em 0.6em;
				border-left: 3px solid #d1242f;
				background: var(--raised);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				line-height: 1.4;
			}

			.menu {
				flex: 0 0 auto;
				margin: 0;
				padding: 0.3em 0;
				border: 1px solid var(--code-edge);
				background: var(--raised);
				list-style: none;
				font-size: var(--step--2);
			}

			.menu li {
				padding: 0.1em 0.8em;
			}

			.menu li:first-child {
				background: var(--mark);
				color: var(--on-mark);
			}
		</style>
	</section>;
}
