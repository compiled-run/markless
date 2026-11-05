import type { PaintedApiSections } from './api-derive/model.ts';

export default function ApiTableView({ painted }: { readonly painted: PaintedApiSections }) @{
	<div class="api-reference">
		@for (const section of painted; key section.id) {
			<section class="api-part" id={section.id}>
				@if (section.headed) {
					<h3><code>{section.name}</code></h3>
				}
				@if (section.empty) {
					<p class="api-none">No props of its own.</p>
				} @else {
					<dl class="props">
						@for (const row of section.rows; key row.name) {
							<div class="prop">
								<dt>
									<code class={row.nameClass}>{row.name}</code>
									<span class="type">{row.type}</span>
								</dt>
								<dd>
									@for (const piece of row.pieces; key piece.id) {
										<code class={piece.pieceClass}>{piece.text}</code>
									}
								</dd>
							</div>
						}
					</dl>
				}
			</section>
		}
		<style>
			.props {
				display: grid;
				gap: 1.1rem;
				margin: 0.6rem 0 var(--space-m);
			}

			.prop {
				display: grid;
				gap: 0.2rem;
			}

			dt {
				display: flex;
				flex-wrap: wrap;
				gap: 0.2rem 0.7rem;
				align-items: baseline;
			}

			.is-required {
				font-weight: 700;
			}

			.type {
				color: var(--muted-ink);
				font-family: var(--font-mono);
				font-size: 0.85em;
				white-space: pre-wrap;
			}

			dd {
				margin: 0;
			}
		</style>
	</div>
}
