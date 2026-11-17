import { Link, type PageProps } from '@markless/router';

export default function App({ params }: PageProps<{ fruit: string }>) @{
	<main>
		<h1>Fruit {params.fruit}</h1>
		<Link href="/[fruit]" params={{ fruit: 'apple' }}>Go to apple</Link>
		<Link href="/[fruit]" params={{ fruit: 'pear' }}>Go to pear</Link>
	</main>
}
