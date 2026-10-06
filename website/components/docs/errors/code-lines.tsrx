import type { CodeLine } from './types.ts';

export default function CodeLines({ lines }: { readonly lines: readonly CodeLine[] }) @{
	<pre class="shiki" data-lang="tsrx">
		<code>
			@for (const line of lines; key line.id) {
				<span class="line">
					@for (const run of line.runs; key run.id) {
						<span style={run.style}>{run.text}</span>;
					}
				</span>;
			}
		</code>
		<style>
			.line {
				display: block;
				min-height: 1lh;
				white-space: pre;
			}
		</style>
	</pre>;
}
