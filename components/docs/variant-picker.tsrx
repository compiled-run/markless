export default function VariantPicker({ pathname }: { readonly pathname: string }) @{
	<nav class="variant-picker" aria-label="Brand variant">
		<a class="variant-a" href={`${pathname}?variant=a`} aria-label="Variant A">A</a>
		<a class="variant-b" href={`${pathname}?variant=b`} aria-label="Variant B">B</a>
		<a class="variant-c" href={`${pathname}?variant=c`} aria-label="Variant C">C</a>

		<style>
			.variant-picker {
				display: inline-flex;
				gap: 0.2rem;
				align-items: center;
			}

			a {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				box-sizing: border-box;
				inline-size: 1.45rem;
				block-size: 1.45rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--2);
				line-height: 1;
				color: var(--ink);
				background: var(--paper);
				border: 1.5px solid var(--code-edge);
				border-radius: 3px;
				text-decoration: none;
			}

			html[data-variant='a'] .variant-a,
			html[data-variant='b'] .variant-b,
			html[data-variant='c'] .variant-c {
				background: var(--yellow);
				border-color: var(--ink);
				box-shadow: 1.5px 1.5px 0 var(--purple);
				transform: rotate(-1deg);
			}
		</style>
	</nav>
}
