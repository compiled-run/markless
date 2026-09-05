export default function VariantPicker({ pathname }: { readonly pathname: string }) @{
	<nav class="variant-picker" aria-label="Design variants">
		<span class="variant-label">Preview style</span>
		<a class="variant-a" data-variant="a" href={pathname + '?variant=a'}><span>A</span> Marker Play</a>
		<a class="variant-b" data-variant="b" href={pathname + '?variant=b'}><span>B</span> Marker Level</a>
		<a class="variant-c" data-variant="c" href={pathname + '?variant=c'}><span>C</span> Margin Notebook</a>
		<a class="variant-d" data-variant="d" href={pathname + '?variant=d'}><span>D</span> Tabbed Journal</a>
	</nav>
}
