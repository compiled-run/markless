// The Styling demo's first card: its own file, so its .card rule reaches only this card.
export default function PaperCard() @{
	<article class="card">
		<style>
			.card {
				padding: 0.5em 0.9em;
				border: 1.5px solid currentColor;
				border-radius: 4px 7px 5px 6px;
				background: color-mix(in oklch, var(--yellow) 55%, transparent);
			}

			p {
				margin: 0;
			}
		</style>
		<p>Paper card</p>
	</article>
}
