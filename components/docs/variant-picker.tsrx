export default function VariantPicker({ pathname }: { readonly pathname: string }) @{
	<nav class="variant-picker" aria-label="Design variants">
		<span class="variant-label">Preview style</span>
		<a class="variant-a" data-variant="a" href={pathname + '?variant=a'}><span>A</span> Brackets</a>
		<a class="variant-b" data-variant="b" href={pathname + '?variant=b'}><span>B</span> Sheet</a>
	</nav>
}
