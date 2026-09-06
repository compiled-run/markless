// The keyboard table a family page carries. Give it a family and it reads the
// rows out of `components/docs/ui-meta/<family>.ts`: the manifest describes
// props, never interactions, so keyboard rows are hand-authored there and
// nowhere else. `rows` is still accepted for a table with no family behind it.
//
// Every keycap is drawn as a symbol and labelled with the plain word, so a
// screen reader says "Enter" where the page shows ⏎. Both platform forms ship in
// the HTML and CSS shows one, because the server has no user agent; the probe
// below stamps `is-mac` or `is-other` on <html>.
import { metaFor } from './ui-meta/index.ts';

export type KeyboardRow = {
	/** One keycap per entry: `['Enter', 'Space']` draws two. */
	readonly keys: readonly string[];
	/** The word drawn between two keycaps. `or` for alternatives, `+` for a chord. */
	readonly join?: string;
	/** What pressing them does. */
	readonly does: string;
};

// No `&`, `<` or `>`: the HTML parser does not decode entities inside a script,
// so anything the serializer escapes would reach the browser as a syntax error.
const PLATFORM_PROBE =
	"(function(){var d=document.documentElement,u=navigator.userAgentData,p=(u?u.platform:'')||navigator.platform||'';d.classList.add(/mac|iphone|ipad|ipod/i.test(p)?'is-mac':'is-other')})()";

export default function KeyboardTable({
	family,
	rows,
}: {
	readonly family?: string;
	readonly rows?: readonly KeyboardRow[];
}) @{
	const source = rows
		? rows.map((row) => ({
				does: row.does,
				join: row.join ?? 'or',
				caps: row.keys.map((key) => ({ mac: { symbol: key, label: key }, other: { symbol: key, label: key } })),
			}))
		: metaFor(family ?? '').keyboard.map((row) => ({
				does: row.does,
				join: row.join ?? 'or',
				caps: row.caps,
			}));

	// The separator is folded into each keycap as the thing drawn before it, because
	// a loop cannot interleave a second element between its own iterations.
	const painted = source.map((row) => ({
		does: row.does,
		caps: row.caps.map((cap, index) => ({
			macSymbol: cap.mac.symbol,
			macLabel: cap.mac.label,
			otherSymbol: cap.other.symbol,
			otherLabel: cap.other.label,
			id: row.does + ':' + index,
			lead: index === 0 ? '' : row.join,
		})),
	}));

	// A script is a legal child of <table>, so the probe runs while the parser is
	// still above the rows and no cap is ever painted in the wrong form.
	<table class="keyboard-table">
		<style>
			/* The heavier bottom edge is what makes a chip read as a key rather than a bordered word. */
			.kbd-cap {
				display: inline-flex;
				align-items: baseline;
				gap: 0.35em;
			}

			.kbd-cap + .kbd-cap {
				margin-left: 0.35em;
			}

			/* Empty on the first keycap of a row, so it reserves nothing there. */
			.kbd-join:empty {
				display: none;
			}

			/* Both forms of every cap are in the HTML and one is shown, because the server
			   has no user agent to read. With no class stamped yet the plain-word form
			   stands, since it is the one that reads on either keyboard. */
			.kbd.is-mac {
				display: none;
			}

			html.is-mac .kbd.is-mac {
				display: inline-block;
			}

			html.is-mac .kbd.is-other {
				display: none;
			}

			.kbd {
				display: inline-block;
				padding: 0.05em 0.5em;
				font-family: inherit;
				font-size: var(--step--1);
				font-weight: 700;
				line-height: 1.7;
				color: var(--ink);
				background: var(--code-surface);
				border: 2px solid var(--code-edge);
				border-bottom-width: 3px;
				border-radius: 6px;
				white-space: nowrap;
			}
		</style>
		<script>{PLATFORM_PROBE}</script>
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
								<kbd class="kbd is-mac" role="img" aria-label={cap.macLabel}>{cap.macSymbol}</kbd>
								<kbd class="kbd is-other" role="img" aria-label={cap.otherLabel}>{cap.otherSymbol}</kbd>
							</span>
						}
					</td>
					<td>{row.does}</td>
				</tr>
			}
		</tbody>
	</table>
}
