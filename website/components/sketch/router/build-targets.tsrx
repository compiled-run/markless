import { state } from '@markless/core';
import PreviewCard, { Choice, Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';

export default function BuildTargets() @{
	let preset = state('node');

	<PreviewCard name="build-targets" label="One app folder, two build outputs">
		<Controls title="Where does the build go?">
			<Choice
				label="Preset"
				hint="Nitro reads the preset from the NITRO_PRESET variable. Node is the default."
				options={['node', 'vercel']}
				value="node"
				onChange={(next: string) => (preset = next)}
			/>
		</Controls>
		<Stage>
			<div class="board" data-preset={preset}>
				<div class="box">
					<div class="head">my-app/</div>
					<ul class="files">
						<li>pages/</li>
						<li>api/</li>
						<li>middleware/</li>
					</ul>
				</div>
				<span class="arrow" aria-hidden="true">→</span>
				<div class="command">
					<span class="prompt">$</span>
					<span class="for-node">npm run build</span>
					<span class="for-vercel">NITRO_PRESET=vercel npm run build</span>
				</div>
				<span class="arrow" aria-hidden="true">→</span>
				<div class="box out">
					<div class="head for-node">.output/</div>
					<div class="head for-vercel">.vercel/output/</div>
					<ul class="files for-node">
						<li>server/index.mjs</li>
						<li>public/build/</li>
					</ul>
					<ul class="files for-vercel">
						<li>static/</li>
						<li>functions/</li>
					</ul>
				</div>
			</div>
		</Stage>
		<Watch>
			<span class="said">
				Same <Mono>my-app/</Mono> folder.{' '}
				{preset === 'node'
					? 'Nitro wrote a Node server to .output/. Start it with node .output/server/index.mjs.'
					: 'Nitro wrote Vercel files to .vercel/output/, with a static/ and a functions/ folder.'}
			</span>
		</Watch>
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.board {
				display: grid;
				grid-template-columns: minmax(0, 1fr) auto minmax(0, 1.2fr) auto minmax(0, 1.1fr);
				gap: 0.6em;
				align-items: center;
				width: 100%;
			}

			.box {
				box-sizing: border-box;
				min-width: 0;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				overflow: hidden;
				transition: background 140ms ease;
			}

			.out {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.head {
				padding: 0.35em 0.85em;
				border-block-end: 1px solid var(--pg-edge);
				font-family: var(--font-mono);
				font-size: 0.85em;
			}

			.files {
				display: grid;
				margin: 0;
				padding: 0.45em 0.85em 0.55em;
				list-style: none;
			}

			li {
				margin: 0;
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.6;
				overflow-wrap: anywhere;
			}

			.command {
				min-width: 0;
				padding: 0.6em 0.75em;
				border: 1px dashed var(--ink);
				border-radius: 6px;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.5;
				overflow-wrap: anywhere;
			}

			.command span {
				font-family: var(--font-mono);
			}

			.prompt {
				margin-inline-end: 0.4em;
				color: var(--muted-ink);
			}

			.board[data-preset='node'] .for-vercel,
			.board[data-preset='vercel'] .for-node {
				display: none;
			}

			.arrow {
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
			}

			@media (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}

				.arrow {
					justify-self: center;
					rotate: 90deg;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.box {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
