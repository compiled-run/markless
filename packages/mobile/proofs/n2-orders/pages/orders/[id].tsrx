import type { PageProps } from '@markless/router';

export default function Order({ params }: PageProps<{ id: string }>) @{
	<main>
		<title>Order {params.id}</title>
		<h1>Details for order {params.id}</h1>
		<p>Shipped to the address on file.</p>
	</main>
}
