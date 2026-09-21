import type { PaintedApiSections } from './api-derive/model.ts';

export default function ApiTableView({ painted }: { readonly painted: PaintedApiSections }) @{
	<div class="api-reference">
		<style>
			.api-prop.is-required {
				font-weight: 700;
			}
		</style>
		@for (const section of painted; key section.id) {
			<section class="api-part" id={section.id}>
				@if (section.headed) {
					<h3><code>{section.name}</code></h3>
				}
				@if (section.empty) {
					<p class="api-none">No props of its own.</p>
				} @else {
					<table class="api-table">
						<thead>
							<tr>
								<th>Prop</th>
								<th>What it does</th>
							</tr>
						</thead>
						<tbody>
							@for (const row of section.rows; key row.name) {
								<tr>
									<td>
										<span class="tsrx-hover prop-name" tabindex={0} role="img" aria-label={row.label}>
											<code class={row.nameClass}>{row.name}</code>
											<span class="tsrx-tip" aria-hidden="true">
												<span class="tsrx-tip-title">{row.name}</span>
												<span class="tsrx-tip-body">{row.type}</span>
											</span>
										</span>
									</td>
									<td>
										@for (const piece of row.pieces; key piece.id) {
											<code class={piece.pieceClass}>{piece.text}</code>
										}
									</td>
								</tr>
							}
						</tbody>
					</table>
				}
			</section>
		}
	</div>
}
