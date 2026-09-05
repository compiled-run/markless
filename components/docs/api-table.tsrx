// The per-part props table a family page carries. Give it a family and a part
// and it reads the rows out of the vendored @markless/ui manifest, so a prop
// added to a family reaches this table by rebuilding. `rows` is still accepted
// for a table with no family behind it.
//
// This file decides that a prop's type belongs in a hover doc rather than a
// third column, so the table stays narrow enough to read on a phone. The hover
// doc is the markup `tooling/highlight-code.ts` builds for a TSRX token
// (`.tsrx-hover` plus `.tsrx-tip`), reused deliberately: the dashed underline,
// the keyboard focus and the screen-reader label are then the site's one idiom
// rather than a second one that has to be kept in step.
import { apiRows, type ApiRow } from './api-derive/index.ts';

export default function ApiTable({
	family,
	part,
	rows,
}: {
	readonly family?: string;
	readonly part?: string;
	readonly rows?: readonly ApiRow[];
}) @{
	const source = rows ?? apiRows(family ?? '', part ?? '');

	// `@if` hangs this build (see components/demos/callout.tsrx), so every choice
	// here is a class picked in TypeScript rather than an element left out.
	const painted = source.map((row) => ({
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
	}));

	// Both repeats sit under one root element: a repeat as the component's own root renders nothing here.
	const tables = painted.length === 0 ? [] : [{ id: 'props' }];
	const notes = painted.length === 0 ? [{ id: 'none', text: 'No props of its own.' }] : [];

	<div class="api-part">
		@for (const note of notes; key note.id) {
			<p class="api-none">{note.text}</p>
		}
		@for (const table of tables; key table.id) {
			<table class="api-table">
				<thead>
					<tr>
						<th>Prop</th>
						<th>What it does</th>
					</tr>
				</thead>
				<tbody>
					@for (const row of painted; key row.name) {
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
	</div>
}
