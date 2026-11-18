import Card from './card.tsrx';

export default function Panel({ label }: { readonly label: string }) @{
	<section>
		<Card label={label} ms={120} />
	</section>
}
