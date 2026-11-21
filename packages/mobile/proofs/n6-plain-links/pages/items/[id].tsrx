import type { PageProps } from '@markless/router';

export default function Item({ params }: PageProps<{ id: string }>) @{
	<main>
		<title>Item {params.id}</title>
		<h1>Showing item {params.id}</h1>
	</main>
}
