import { commandVariants, type CommandKind } from './commands.ts';

/** Every package manager's version of one shell block; the one named by `data-pm` on <html> shows, npm when none is. */
export default function Commands({ kind }: { readonly kind: CommandKind }) @{
	const variants = commandVariants(kind);

	<div class="commands">
		@for (const variant of variants; key variant.manager) {
			<div class="variant" data-pm={variant.manager}>
				<div class="torn-strip">
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
					<pre
						data-lang="bash"
						class="shiki shiki-themes github-light github-dark"
						tabindex="0"
					>
						<code>
							@for (const line of variant.lines; key line.id) {
								<span class="line">
									@for (const run of line.runs; key run.id) {
										<span style={run.style}>
											{run.text}
										</span>;
									}
								</span>;
							}
						</code>
					</pre>
				</div>
			</div>;
		}
		<style>
			.variant {
				display: none;
			}

			.line {
				display: block;
			}

			/* One selector per manager in facts.ts MANAGERS; walkthrough.test.ts checks none is missing. */
			html:not([data-pm]) .variant[data-pm='npm'],
			html[data-pm='npm'] .variant[data-pm='npm'],
			html[data-pm='pnpm'] .variant[data-pm='pnpm'],
			html[data-pm='yarn'] .variant[data-pm='yarn'],
			html[data-pm='bun'] .variant[data-pm='bun'],
			html[data-pm='deno'] .variant[data-pm='deno'] {
				display: block;
			}
		</style>
	</div>;
}
