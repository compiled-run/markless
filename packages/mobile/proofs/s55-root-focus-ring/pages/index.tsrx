import { Link } from '@markless/router';

export default function Home() @{
	<main class="home">
		<style>
			.home {
				padding: 24px;
				background: #f4f1ea;
				color: #1d1b16;
				font-size: 18px;
			}
			.heading {
				margin: 0 0 16px;
				font-size: 28px;
				font-weight: 700;
			}
			.card {
				display: block;
				padding: 12px 16px;
				border: 1px solid #ced4da;
				border-radius: 10px;
				background: #ffffff;
			}
		</style>
		<h1 class="heading">Focus ring</h1>
		<Link href="/notes/[id]" params={{ id: 'ring' }} class="card">Open the note</Link>
	</main>
}
