import { state } from '@markless/core';
import { shellLine } from './walkthrough/commands.ts';
import { asset } from '../../site-base.ts';
import { INK_MARKS } from './ink-marks.ts';

/** One shell command on a torn strip, highlighted like a ```bash fence, with a button that copies it. */
export default function CommandStrip({ command }: { readonly command: string }) @{
	const line = shellLine(command, undefined, 0, 'command');
	let copied = state('no');
	const marks = asset(INK_MARKS) + '#';

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
			<span class="icon" aria-hidden="true">
				<svg class="idle" viewBox="0 0 108 108">
					<use href={marks + 'copy'} />
				</svg>
				<svg class="done" viewBox="0 0 108 108">
					<use href={marks + 'copied'} />
				</svg>
			</span>
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
				top: 0.95rem;
				right: 1rem;
				display: inline-flex;
				align-items: center;
				gap: 0.4rem;
				padding: 0.25rem 0.55rem 0.25rem 0.4rem;
				border: 0;
				border-radius: 0.5rem;
				background: transparent;
				color: inherit;
				font: inherit;
				font-size: 0.9rem;
				line-height: 1.2;
				cursor: pointer;
				opacity: 0.8;
				transition: opacity 120ms ease, background-color 120ms ease;
			}

			.copy:hover,
			.copy:focus-visible,
			.copy[data-copied='yes'] {
				opacity: 1;
			}

			.copy:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.copy:focus-visible {
				outline: 2px dashed currentColor;
				outline-offset: 3px;
			}

			.icon {
				display: grid;
				width: 2em;
				height: 2em;
			}

			.icon > svg {
				grid-area: 1 / 1;
				width: 100%;
				height: 100%;
				overflow: visible;
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
