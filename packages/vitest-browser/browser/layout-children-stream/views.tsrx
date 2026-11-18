import List from './list.tsrx';

function Heading({ text }: { readonly text: string }) @{
	<h2>{text}</h2>
}

function Summary() @{
	<footer>
		<Heading text="Every view" />
	</footer>
}

export default function Views() @{
	const views = ['north', 'south'];
	<div>
		<Heading text="Views" />
		@for (const view of views; key view) {
			<List label={view} />
		}
		<Summary />
	</div>
}
