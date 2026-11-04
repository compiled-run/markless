// The ui-* attributes a family writes: which parts carry each one, read from the package, and when it is on.
import { metaFor } from './ui-meta/index.ts';
import { parts } from './ui-parts/parts.data.ts';

export default function HooksTable({ family }: { readonly family?: string }) @{
	const name = family ?? '';
	const when = metaFor(name).hooks ?? {};
	const facts = parts[name] ?? [];
	const written = [...new Set(facts.flatMap((part) => part.hooks))];
	const missing = written.filter((hook) => !(hook in when));
	const extra = Object.keys(when).filter((hook) => !written.includes(hook));
	if (missing.length > 0 || extra.length > 0)
		throw new Error(
			`hooks-table: ui-meta/${name}.ts hooks must name exactly the attributes the family writes. Missing: ${missing.join(', ') || 'none'}. Not written by the family: ${extra.join(', ') || 'none'}.`,
		);
	const rows = Object.entries(when).map(([hook, text]) => ({
		hook,
		pieces: text.split('`').map((piece, index) => ({ id: String(index), text: piece, code: index % 2 === 1 })),
		on: facts
			.filter((part) => part.hooks.includes(hook))
			.map((part, index, all) => ({ id: part.part, last: index === all.length - 1 })),
	}));

	<table class="hooks-table">
		<thead>
			<tr>
				<th>Attribute</th>
				<th>On</th>
				<th>When</th>
			</tr>
		</thead>
		<tbody>
			@for (const row of rows; key row.hook) {
				<tr>
					<td><code>{row.hook}</code></td>
					<td>
						@for (const part of row.on; key part.id) {
							<span class="on"><code>{part.id}</code>{part.last ? '' : ', '}</span>
						}
					</td>
					<td>
						@for (const piece of row.pieces; key piece.id) {
							@if (piece.code) {
								<code>{piece.text}</code>
							} @else {
								<span>{piece.text}</span>
							}
						}
					</td>
				</tr>
			}
		</tbody>
	</table>
}
