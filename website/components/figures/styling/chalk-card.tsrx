// The Styling demo's second card: the same class name, a different file, so a different look.
export default function ChalkCard() @{
	<article class="card">
		<style>
			.card {
				padding: 0.5em 0.9em;
				border: 1.5px dashed currentColor;
				border-radius: 6px 4px 7px 5px;
				background: color-mix(in oklch, var(--screen-ink, var(--ink)) 80%, transparent);
				color: var(--screen-paper, var(--paper));
			}

			p {
				margin: 0;
			}
		</style>
		<p>Chalk card</p>
	</article>
}
