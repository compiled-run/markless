export default function PaperTag({ size }: { readonly size: string }) @{
	<div class="card" data-size={size}>
		Paper card
		<style>
			.card {
				padding: 0.7em 1.2em;
				border: 1.5px solid var(--ink);
				border-radius: 6px;
				background: var(--tinted);
				color: var(--ink);
				font-size: var(--step-0);
			}

			.card[data-size='big'] {
				padding: 1.1em 1.8em;
				font-size: var(--step-1);
			}
		</style>
	</div>
}
