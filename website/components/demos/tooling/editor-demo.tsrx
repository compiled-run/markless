import { state } from '@markless/core';
import PreviewCard, { Controls, Stage, Switch, Watch } from '../../docs/preview-card.tsrx';

// A drawing of an editor, not a real one: the hint, the wavy line and the menu are the plugin's real output.
export default function EditorDemo() @{
	let extension = state(false);
	let plugin = state(false);

	<PreviewCard name="editor" label="What the extension and the plugin each add">
		<Controls>
			<Switch
				label="Extension"
				hint="The TSRX editor extension. It knows the syntax, so it adds the colours."
				onChange={(on: boolean) => (extension = on)}
			/>
			<Switch
				label="Plugin"
				hint="@markless/typescript-plugin, named in tsconfig.json. It knows Markless."
				onChange={(on: boolean) => (plugin = on)}
			/>
		</Controls>
		<Stage>
			<div class="editor" data-ext={extension ? 'on' : 'off'} data-plugin={plugin ? 'on' : 'off'}>
				<div class="tab">Menu.tsrx</div>
				<div class="code">
					<span class="row"><span class="k">import</span>{' { state } '}<span class="k">from</span>{' '}<span class="s">'@markless/core'</span>;</span>
					<span class="row"><span class="k">import</span>{' * '}<span class="k">as</span>{' widget '}<span class="k">from</span>{' '}<span class="s">'./widget.tsrx'</span>;</span>
					<span class="row"> </span>
					<span class="row"><span class="k">export function</span>{' '}<span class="f">Menu</span>{'() '}<span class="k">{'@'}</span>{'{'}</span>
					<span class="row">{'\t'}<span class="k">let</span>{' count = '}<span class="f">state</span>{'(0);'}</span>
					<span class="row"> </span>
					<span class="row">{'\t'}<span class="t">{'<widget.trigger'}</span><span class="hint">: button</span>{' '}<span class="a">value</span>=<span class="s">"go"</span><span class="t">{'>'}</span>Go<span class="t">{'</widget.trigger>'}</span></span>
					<span class="row">{'\t'}<span class="t">{'<button'}</span>{' '}<span class="a squiggle">onClik</span>{'={() => count++}'}<span class="t">{'>'}</span>Add<span class="t">{'</button>'}</span></span>
					<span class="row">{'\t'}<span class="k">{'@'}</span><span class="caret" aria-hidden="true"></span></span>
					<span class="row">{'}'}</span>
				</div>
				<div class="popups">
					<span class="problem">Property 'onClik' does not exist on type '…'. Did you mean 'onClick'?</span>
					<ul class="menu" aria-label="Suggestions after @">
						<li>{'@if'}</li>
						<li>{'@if-@else'}</li>
						<li>{'@for-of'}</li>
						<li>{'@for-key'}</li>
						<li>{'@try-@pending'}</li>
					</ul>
				</div>
			</div>
		</Stage>
		<Watch>
			<span class="said">
				{extension && plugin
					? 'Colours from the extension. The hint, the wavy line and the @ menu come from the plugin.'
					: extension
						? 'The extension knows TSRX syntax, so the file has colours. It knows nothing about Markless.'
						: plugin
							? 'The plugin already gives hints, errors and suggestions. Colours still need the extension.'
							: 'Plain grey text. The editor does not know what a .tsrx file is.'}
			</span>
		</Watch>
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.editor {
				box-sizing: border-box;
				width: min(34rem, 100%);
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				overflow: hidden;
			}

			.tab {
				padding: 0.35em 0.85em;
				border-block-end: 1px solid var(--pg-edge);
				font-family: var(--font-mono);
				font-size: 0.85em;
			}

			.code {
				padding: 0.6em 0;
				overflow-x: auto;
				color: var(--muted-ink);
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.6;
				tab-size: 2;
			}

			.code span {
				font-family: var(--font-mono);
			}

			.row {
				display: block;
				min-height: 1lh;
				padding-inline: 0.85em;
				white-space: pre;
			}

			.editor[data-ext='on'] .code {
				color: var(--ink);
			}

			.editor[data-ext='on'] .k {
				color: color-mix(in oklch, var(--pink) 55%, var(--ink));
			}

			.editor[data-ext='on'] .s {
				color: color-mix(in oklch, var(--green-star) 50%, var(--ink));
			}

			.editor[data-ext='on'] :is(.f, .t) {
				color: color-mix(in oklch, var(--purple) 60%, var(--ink));
			}

			.editor[data-ext='on'] .a {
				color: color-mix(in oklch, var(--yellow) 35%, var(--ink));
			}

			.hint {
				display: none;
				margin-inline: 0.3em 0.1em;
				padding: 0 0.35em;
				border-radius: 3px;
				background: var(--quiet-fill);
				color: var(--ink);
			}

			.editor[data-plugin='on'] .hint {
				display: inline;
			}

			.editor[data-plugin='on'] .squiggle {
				text-decoration: underline wavy var(--pink);
				text-decoration-thickness: 1.5px;
				text-underline-offset: 0.25em;
			}

			.caret {
				display: inline-block;
				width: 0;
				height: 1.1em;
				vertical-align: text-bottom;
				border-inline-start: 2px solid var(--ink);
			}

			.popups {
				display: none;
				flex-wrap: wrap;
				gap: 0.7em;
				align-items: flex-start;
				padding: 0 0.85em 0.85em;
			}

			.editor[data-plugin='on'] .popups {
				display: flex;
			}

			.problem {
				flex: 1 1 14rem;
				padding: 0.45em 0.7em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: color-mix(in srgb, var(--pink) 18%, var(--paper));
				font-family: var(--font-mono);
				font-size: 0.8em;
				line-height: 1.45;
			}

			.menu {
				flex: 0 0 auto;
				margin: 0;
				padding: 0.25em 0;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				list-style: none;
			}

			.menu li {
				margin: 0;
				padding: 0.1em 0.8em;
				font-family: var(--font-mono);
				font-size: 0.8em;
			}

			.menu li:first-child {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}
		</style>
	</PreviewCard>
}
