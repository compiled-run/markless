import { commandVariants, type CommandKind } from './commands.ts';
import type { ManagerId } from './facts.ts';
import CopyButton from '../copy-button.tsrx';

/** Every package manager's version of one shell block; the one named by `data-package-manager` on <html> shows, npm when none is. With `only`, just that manager's block, always shown. With `copy`, each block gets the ink Copy button. */
export default function Commands({ kind, only, copy }: { readonly kind: CommandKind; readonly only?: ManagerId; readonly copy?: boolean }) @{
	const variants = commandVariants(kind).filter((variant) => !only || variant.manager === only);

	<div class="commands" data-only={only ? 'yes' : 'no'}>
		@for (const variant of variants; key variant.manager) {
			<div class="variant" data-package-manager={variant.manager}>
				<div class="torn-strip" data-copy={copy ? 'yes' : 'no'}>
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
					@if (copy) {
						<CopyButton text={variant.code} />
					}
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

			.torn-strip[data-copy='yes'] {
				container-type: inline-size;
			}

			.torn-strip[data-copy='yes'] > pre {
				padding-inline-end: 7.5rem;
			}

			@container (width < 32rem) {
				.torn-strip[data-copy='yes'] > pre {
					padding-inline-end: 3.75rem;
				}
			}

			/* One selector per manager in facts.ts MANAGERS; walkthrough.test.ts checks none is missing. */
			html:not([data-package-manager]) .variant[data-package-manager='npm'],
			html[data-package-manager='npm'] .variant[data-package-manager='npm'],
			html[data-package-manager='pnpm'] .variant[data-package-manager='pnpm'],
			html[data-package-manager='yarn'] .variant[data-package-manager='yarn'],
			html[data-package-manager='bun'] .variant[data-package-manager='bun'],
			.commands[data-only='yes'] .variant {
				display: block;
			}
		</style>
	</div>;
}
