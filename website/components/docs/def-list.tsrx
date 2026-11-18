// A list of named things with what each does, at body size: the replacement for small content tables.
type Item = {
	/** The name, set as code. */
	readonly term: string;
	/** Where it applies, such as the parts an attribute is written on. */
	readonly on?: string;
	/** One line; spans in backticks are set as code. */
	readonly text: string;
};

export default function DefList({ items }: { readonly items: readonly Item[] }) @{
	const rows = items.map((item, index) => ({
		id: String(index),
		term: item.term,
		on: item.on ?? '',
		pieces: item.text.split('`').map((text, at) => ({ id: String(at), text, code: at % 2 === 1 })),
	}));

	<dl class="def-list">
		@for (const row of rows; key row.id) {
			<div class="entry">
				<dt>
					<code>{row.term}</code>
					<span class="on">{row.on}</span>
				</dt>
				<dd>
					@for (const piece of row.pieces; key piece.id) {
						<span class={piece.code ? 'code' : 'text'}>{piece.text}</span>
					}
				</dd>
			</div>
		}
		<style>
			.def-list {
				display: grid;
				gap: 1rem;
				margin: var(--space-s) 0 var(--space-m);
			}

			.entry {
				display: grid;
				gap: 0.15rem;
			}

			dt {
				display: flex;
				flex-wrap: wrap;
				gap: 0.2rem 0.7rem;
				align-items: baseline;
			}

			.on {
				color: var(--muted-ink);
			}

			.on:empty {
				display: none;
			}

			dd {
				margin: 0;
			}

			.code {
				padding: 0.05em 0.3em;
				border-radius: 4px;
				background: color-mix(in oklch, var(--ink) 8%, transparent);
				font-family: var(--font-mono);
				font-size: 0.9em;
			}
		</style>
	</dl>
}
