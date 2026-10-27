import { state } from '@markless/core';
import { shellLine } from './walkthrough/commands.ts';

/** One shell command on a torn strip, highlighted like a ```bash fence, with a button that copies it. */
export default function CommandStrip({ command }: { readonly command: string }) @{
	const line = shellLine(command, undefined, 0, 'command');
	let copied = state('no');

	<div class="torn-strip command-strip">
		<span class="torn-art" aria-hidden="true">
			<span class="torn-cast">
				<span class="torn-below"></span>
				<span class="torn-beside"></span>
				<span class="torn-corner"></span>
			</span>
			<span class="torn-middle"></span>
			<span class="torn-band torn-upper"></span>
			<span class="torn-band torn-lower"></span>
			<span class="torn-ends"></span>
		</span>
		<pre data-lang="bash" class="shiki shiki-themes github-light github-dark" tabindex="0">
			<code>
				<span class="line">
					@for (const run of line.runs; key run.id) {
						<span style={run.style}>{run.text}</span>;
					}
				</span>
			</code>
		</pre>
		<button
			type="button"
			class="copy"
			data-copied={copied}
			data-command={command}
			aria-label={'Copy the command: ' + command}
			onClick={(event) => {
				const button = (event.target as Element).closest('button')!;
				const click = String(event.timeStamp);
				button.dataset.click = click;
				void navigator.clipboard?.writeText(button.dataset.command!).then(() => {
					copied = 'yes';
					setTimeout(() => {
						if (button.dataset.click === click) copied = 'no';
					}, 2000);
				});
			}}
		>
			<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
				<path class="idle" d="M8.5 4.5H7a2 2 0 0 0-2 2v12.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2h-1.5M9.5 3h5v3h-5z" />
				<path class="done" d="M5 12.5l4.5 4.5L19 7" />
			</svg>
			<span class="words" aria-hidden="true">
				<span class="idle">Copy</span>
				<span class="done">Copied</span>
			</span>
		</button>
		<p class="status" role="status">{copied === 'yes' ? 'Copied to your clipboard' : ''}</p>
		<style>
			.command-strip {
				container-type: inline-size;
			}

			.command-strip > pre {
				padding-inline-end: 7.5rem;
			}

			.copy {
				position: absolute;
				top: 1.05rem;
				right: 1.1rem;
				display: inline-flex;
				align-items: center;
				gap: 0.35rem;
				padding: 0.3rem 0.6rem;
				border: 1.5px solid color-mix(in oklch, currentColor 45%, transparent);
				border-radius: 0.5rem;
				background: transparent;
				color: inherit;
				font: inherit;
				font-size: 0.9rem;
				line-height: 1.2;
				cursor: pointer;
				opacity: 0.8;
				transition: opacity 120ms ease, border-color 120ms ease;
			}

			.copy:hover,
			.copy:focus-visible,
			.copy[data-copied='yes'] {
				opacity: 1;
				border-color: currentColor;
			}

			.copy:focus-visible {
				outline: 2px dashed currentColor;
				outline-offset: 3px;
			}

			.icon {
				width: 1.1em;
				height: 1.1em;
				fill: none;
				stroke: currentColor;
				stroke-width: 1.8;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.words {
				display: grid;
			}

			.words > span {
				grid-area: 1 / 1;
			}

			.copy .done,
			.copy[data-copied='yes'] .idle {
				visibility: hidden;
			}

			.copy[data-copied='yes'] .done {
				visibility: visible;
			}

			.status {
				position: absolute;
				width: 1px;
				height: 1px;
				margin: 0;
				overflow: hidden;
				clip-path: inset(50%);
			}

			@container (width < 32rem) {
				.command-strip > pre {
					padding-inline-end: 3.75rem;
				}

				.words {
					display: none;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.copy {
					transition: none;
				}
			}
		</style>
	</div>
}
