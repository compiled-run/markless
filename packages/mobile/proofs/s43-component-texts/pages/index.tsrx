import { Link } from '@markless/router';

export default function Home() @{
	<main class="home">
		<style>
			.home {
				padding: 24px;
				background: #f4f1ea;
			}
			.heading {
				font-size: 28px;
				font-weight: 700;
			}
			.next {
				display: block;
				margin-top: 16px;
				padding: 12px 18px;
				border: 2px solid #1d1b16;
				border-radius: 12px;
				background: #ffd166;
				color: #1d1b16;
				font-size: 18px;
				text-decoration: none;
			}
		</style>
		<h1 class="heading">Pantry</h1>
		<Link href="/notes/[id]" params={{ id: 'Groceries' }} class="next">Open groceries</Link>
	</main>
}
