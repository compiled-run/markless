export default function VariantPicker({ pathname }: { readonly pathname: string }) @{
	<nav class="variant-picker" aria-label="Design variants">
		<span class="variant-label">Try a look</span>
		<a class="variant-a" data-variant="a" href={pathname + '?variant=a'}><span>A</span> Poster</a>
		<a class="variant-b" data-variant="b" href={pathname + '?variant=b'}><span>B</span> Field notes</a>
		<a class="variant-c" data-variant="c" href={pathname + '?variant=c'}><span>C</span> Cut &amp; paste</a>
	</nav>
}
