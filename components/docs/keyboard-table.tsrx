// The keyboard table a family page carries. Give it a family and it reads the
// rows out of `components/docs/ui-meta/<family>.ts`: the manifest describes
// props, never interactions, so keyboard rows are hand-authored there and
// nowhere else. `rows` is still accepted for a table with no family behind it.
//
// Every keycap is drawn as a symbol and labelled with the plain word, so a
// screen reader says "Enter" where the page shows ⏎. Keycap styling lives in
// styles/global.css, not in a block here: a component whose only styling is its
// own style block renders unstyled on this build (NOTES.md finding 26).
import { formFor, metaFor, type KeyPlatform } from './ui-meta/index.ts';

export type KeyboardRow = {
	/** One keycap per entry: `['Enter', 'Space']` draws two. */
	readonly keys: readonly string[];
	/** The word drawn between two keycaps. `or` for alternatives, `+` for a chord. */
	readonly join?: string;
	/** What pressing them does. */
	readonly does: string;
};

export default function KeyboardTable({
	family,
	rows,
	platform,
}: {
	readonly family?: string;
	readonly rows?: readonly KeyboardRow[];
	/** Which keyboard the caps are drawn for. The server has no user agent, so it draws the symbol form. */
	readonly platform?: KeyPlatform;
}) @{
	const source = rows
		? rows.map((row) => ({
				does: row.does,
				join: row.join ?? 'or',
				forms: row.keys.map((key) => ({ symbol: key, label: key })),
			}))
		: metaFor(family ?? '').keyboard.map((row) => ({
				does: row.does,
				join: row.join ?? 'or',
				forms: row.caps.map((cap) => formFor(cap, platform ?? 'mac')),
			}));

	// The separator is folded into each keycap as the thing drawn before it, because
	// a loop cannot interleave a second element between its own iterations.
	const painted = source.map((row) => ({
		does: row.does,
		caps: row.forms.map((form, index) => ({
			symbol: form.symbol,
			label: form.label,
			id: row.does + ':' + index,
			lead: index === 0 ? '' : row.join,
		})),
	}));

	<table class="keyboard-table">
		<thead>
			<tr>
				<th>Key</th>
				<th>What it does</th>
			</tr>
		</thead>
		<tbody>
			@for (const row of painted; key row.does) {
				<tr>
					<td class="keyboard-keys">
						@for (const cap of row.caps; key cap.id) {
							<span class="kbd-cap">
								<span class="kbd-join">{cap.lead}</span>
								<kbd class="kbd" role="img" aria-label={cap.label}>{cap.symbol}</kbd>
							</span>
						}
					</td>
					<td>{row.does}</td>
				</tr>
			}
		</tbody>
	</table>
}
