import { apiRows, apiSections, type ApiRow } from './api-derive/index.ts';
import { metaIfAny } from './ui-meta/index.ts';

// With `family` alone it is the whole API reference: every part of the family in
// its ui-meta order, each under its own heading, so a part added to the family
// reaches the docs by rebuilding. With `part` or `rows` it is one table.
export default function ApiTable({
	family,
	part,
	rows,
}: {
	readonly family?: string;
	readonly part?: string;
	readonly rows?: readonly ApiRow[];
}) @{
	const name = family ?? '';
	const sections =
		rows === undefined && part === undefined
			? apiSections(name, metaIfAny(name)?.partOrder)
			: [{ name: '', id: '', rows: rows ?? apiRows(name, part ?? '') }];

	const painted = sections.map((section) => ({
		id: section.id,
		name: section.name,
		headed: section.name !== '',
		empty: section.rows.length === 0,
		rows: section.rows.map((row) => ({
			name: row.name,
			type: row.type,
			label: row.name + ': ' + row.type,
			nameClass: row.required === true ? 'api-prop is-required' : 'api-prop',
			pieces: [
				...(row.required === true ? [{ text: 'Required. ', code: false }] : []),
				...row.does
					.split('`')
					.map((text, index) => ({ text, code: index % 2 === 1 }))
					.filter((piece) => piece.text !== ''),
				...(row.default === undefined
					? []
					: [
							{ text: ' Default ', code: false },
							{ text: row.default, code: true },
							{ text: '.', code: false },
						]),
			].map((piece, index) => ({
				text: piece.text,
				id: row.name + ':' + index,
				pieceClass: piece.code ? 'api-code' : 'api-text',
			})),
		})),
	}));

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
