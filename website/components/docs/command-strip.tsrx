import { shellLine } from './walkthrough/commands.ts';
import CopyButton from './copy-button.tsrx';

/** One shell command on a torn strip, highlighted like a ```bash fence, with a button that copies it. */
export default function CommandStrip({ command }: { readonly command: string }) @{
	const line = shellLine(command, undefined, 0, 'command');

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
		<CopyButton text={command} />
		<style>
			.command-strip {
				container-type: inline-size;
			}

			.command-strip > pre {
				padding-inline-end: 7.5rem;
			}

			@container (width < 32rem) {
				.command-strip > pre {
					padding-inline-end: 3.75rem;
				}
			}
		</style>
	</div>
}
