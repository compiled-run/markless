import AsyncItem from './async-item.tsrx';

export default function ItemCard({ id }: { readonly id: number }) @{
	<article>
		<AsyncItem id={id} />
	</article>
}
