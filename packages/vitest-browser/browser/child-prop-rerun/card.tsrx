import Detail from './detail.tsrx';

export default function Card({ id, url }: { readonly id: string; readonly url: { readonly search: string } }) @{
	<article>
		<Detail id={id} url={url} />
	</article>
}
