import { navigate, type PageProps } from '@markless/router';

export default function Order({ params }: PageProps<{ id: string }>) @{
	<main>
		<title>Order {params.id}</title>
		<h1>Details for order {params.id}</h1>
		<button onClick={() => navigate(String(Number(params.id) + 1), { replace: true })}>
			Next one instead
		</button>
	</main>
}
