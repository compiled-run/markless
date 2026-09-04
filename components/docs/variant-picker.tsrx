export default function VariantPicker({ pathname }: { readonly pathname: string }) @{
	<nav class="variant-picker" aria-label="Brand variant">
		<a class="variant-a" href={`${pathname}?variant=a`} aria-label="Variant A">A</a>
		<a class="variant-b" href={`${pathname}?variant=b`} aria-label="Variant B">B</a>
		<a class="variant-c" href={`${pathname}?variant=c`} aria-label="Variant C">C</a>
	</nav>
}
