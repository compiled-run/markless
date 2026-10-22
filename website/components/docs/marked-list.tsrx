import InkLogo, { type Mark } from './ink-logo.tsrx';

/** A list whose bullets are small ink drawings. `items` lists `mark:text` pairs separated by `|`. */
export default function MarkedList({ items }: { readonly items: string }) @{
	const rows = items.split('|').map((pair) => {
		const at = pair.indexOf(':');
		return { mark: pair.slice(0, at) as Mark, text: pair.slice(at + 1) };
	});

	<ul class="marked-list">
		@for (const row of rows; key row.mark) {
			<li>
				<InkLogo mark={row.mark} />
				{row.text}
			</li>
		}
		<style>
			.marked-list {
				list-style: none;
				padding-inline-start: 0;
			}

			.marked-list li {
				margin-block: 0.35em;
			}
		</style>
	</ul>
}
