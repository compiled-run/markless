import { state } from '@markless/core';
import PreviewCard, { Action, Choice, Controls, Stage, Watch } from '../../docs/preview-card.tsrx';

// The error line is what the Markless type checker printed for these two files.
export default function TypecheckDemo() @{
	let shown = state('{42}');
	let checked = state(false);

	<PreviewCard name="typecheck" label="The type checker points at your line">
		<Controls>
			<Choice
				label="label"
				hint="The value App passes to Nav. Nav wants a string."
				options={['{42}', '"Home"']}
				value="{42}"
				onChange={(next: string) => {
					shown = next;
					checked = false;
				}}
			/>
			<Action end disabled={checked} onClick={() => (checked = true)}>Check</Action>
		</Controls>
		<Stage>
			<div class="board" data-bad={checked && shown === '{42}' ? 'yes' : 'no'}>
				<div class="box">
					<div class="head">Nav.tsrx</div>
					<div class="code">
						<span class="line">{'export function Nav({ label }: { readonly label: string }) @{'}</span>
						<span class="line">{'\t<nav>{label}</nav>'}</span>
						<span class="line">{'}'}</span>
					</div>
				</div>
				<div class="box">
					<div class="head">App.tsrx</div>
					<div class="code">
						<span class="line">{"import { Nav } from './Nav.tsrx';"}</span>
						<span class="line"> </span>
						<span class="line">{'export function App() @{'}</span>
						<span class="line wrong">{'\t<Nav label='}{shown}{' />'}</span>
						<span class="error">{"App.tsrx(4,7): error TS2322: Type 'number' is not assignable to type 'string'."}</span>
						<span class="line">{'}'}</span>
					</div>
				</div>
			</div>
		</Stage>
		<Watch>
			<span class="said">
				{checked
					? shown === '{42}'
						? 'TypeScript checked a TSX copy of App.tsrx. The error points back at line 4 of your file.'
						: 'No errors. "Home" is a string, so Nav accepts it.'
					: 'Press Check to run the type checker on both files.'}
			</span>
		</Watch>
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.board {
				display: grid;
				gap: 1em;
				width: min(34rem, 100%);
			}

			.box {
				box-sizing: border-box;
				min-width: 0;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				overflow: hidden;
			}

			.head {
				padding: 0.35em 0.85em;
				border-block-end: 1px solid var(--pg-edge);
				font-family: var(--font-mono);
				font-size: 0.85em;
			}

			.code {
				padding: 0.6em 0;
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.6;
				tab-size: 2;
			}

			.line {
				display: block;
				min-height: 1lh;
				padding-inline: calc(0.85em + 4ch) 0.85em;
				text-indent: -4ch;
				white-space: pre-wrap;
				font-family: var(--font-mono);
				transition: background 140ms ease;
			}

			.error {
				display: none;
				margin: 0.2em 0.85em 0.3em;
				padding: 0.35em 0.6em;
				border-inline-start: 3px solid var(--pink);
				font-family: var(--font-mono);
				overflow-wrap: anywhere;
			}

			.board[data-bad='yes'] .wrong {
				background: color-mix(in srgb, var(--pink) 22%, var(--paper));
			}

			.board[data-bad='yes'] .error {
				display: block;
			}

			@media (prefers-reduced-motion: reduce) {
				.line {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
