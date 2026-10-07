import { state } from '@markless/core';
import PreviewCard, { Controls, Stage, Switch, Watch } from '../../docs/preview-card.tsrx';
import Code from '../../docs/preview-card/code.tsrx';
import { typoCount } from './code-panes.ts';
import TypoCount from './typo-count.tsrx';

export default function TypoCountDemo() @{
	let names = state(false);

	<PreviewCard name="typo-count" label="A demo and the card around it">
		<Controls title="A demo is two files">
			<Switch
				label="Part names"
				hint="Label each band of this card with the PreviewCard part that draws it."
				onChange={(on: boolean) => (names = on)}
			/>
			<span class="part end" hidden={!names}>{'<Controls>'}</span>
		</Controls>
		<Stage>
			<div class="spot">
				<span class="part corner" hidden={!names}>{'<Stage>'}</span>
				<TypoCount />
			</div>
		</Stage>
		<Watch>
			<span class="said">
				<code class="file">typo-count.tsrx</code> made the button.{' '}
				<code class="file">typo-count-demo.tsrx</code> made this card around it.
			</span>
			<span class="part" hidden={!names}>{'<Watch>'}</span>
		</Watch>
		<div class="code-tag">
			<span class="part code" hidden={!names}>{'<Code>'}</span>
		</div>
		<Code files={typoCount} />
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.part {
				padding: 0.05em 0.45em;
				border: 1px solid var(--ink);
				border-radius: 4px;
				background: var(--mark);
				color: var(--on-mark);
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.4;
				white-space: nowrap;
			}

			.part[hidden] {
				display: none;
			}

			.end {
				margin-inline-start: auto;
			}

			.said + .part {
				margin-inline-start: 0.6em;
			}

			.spot {
				position: relative;
				display: grid;
				place-items: center;
				width: 100%;
				min-height: calc(18rem - 4.75em);
			}

			.corner {
				position: absolute;
				inset-block-start: -1.9em;
				inset-inline-start: 0;
			}

			.said {
				font-family: var(--pg-font);
			}

			.file {
				padding: 0;
				background: none;
				color: inherit;
				font-family: var(--font-mono);
				font-size: 0.92em;
			}

			.code-tag {
				position: relative;
				height: 0;
			}

			.code {
				position: absolute;
				inset-block-start: 0.6em;
				inset-inline-end: 1.35em;
				z-index: 2;
			}
		</style>
	</PreviewCard>
}
