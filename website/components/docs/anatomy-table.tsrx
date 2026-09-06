// The parts a family is built from, straight out of the vendored @markless/ui
// manifest: the part names, the one line each part's own doc comment opens with,
// and the exported component behind it in the hover doc. Nothing here is
// hand-written, so a part added to a family shows up by rebuilding.
//
// It wears `.api-table`, because a parts table and a props table are the same
// two columns and the fleet should not grow a second table look.
import { anatomyRows } from './api-derive/index.ts';
import { metaIfAny } from './ui-meta/index.ts';

export default function AnatomyTable({ family }: { readonly family?: string }) @{
	const name = family ?? '';
	const rows = anatomyRows(name, metaIfAny(name)?.partOrder);

	const painted = rows.map((row) => ({
		name: row.name,
		component: row.component,
		label: row.name + ': ' + row.component,
		pieces: row.does
			.split('`')
			.map((text, index) => ({ text, code: index % 2 === 1 }))
			.filter((piece) => piece.text !== '')
			.map((piece, index) => ({
				text: piece.text,
				id: row.name + ':' + index,
				pieceClass: piece.code ? 'api-code' : 'api-text',
			})),
	}));

	<table class="api-table anatomy-table">
		<thead>
			<tr>
				<th>Part</th>
				<th>What it is</th>
			</tr>
		</thead>
		<tbody>
			@for (const row of painted; key row.name) {
				<tr>
					<td>
						<span class="tsrx-hover prop-name" tabindex={0} role="img" aria-label={row.label}>
							<code class="api-prop">{row.name}</code>
							<span class="tsrx-tip" aria-hidden="true">
								<span class="tsrx-tip-title">{row.name}</span>
								<span class="tsrx-tip-body">{row.component}</span>
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
