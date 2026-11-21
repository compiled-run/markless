import { Link } from '@markless/router';

export default function Harbour() @{
	<main class="harbour">
		<style>
			.harbour {
				padding: 24px;
			}
			.heading {
				font-size: 26px;
				font-weight: 700;
				color: #3d405b;
			}
			.next {
				display: block;
				margin-top: 16px;
				padding: 10px 16px;
				border-radius: 10px;
				background: #81b29a;
				color: #1d1b16;
				font-size: 17px;
				text-decoration: none;
			}
			@media (prefers-color-scheme: dark) {
				.heading {
					color: #f4efe6;
				}
			}
		</style>
		<title>Harbour</title>
		<h1 class="heading">Tide table</h1>
		<Link class="next" href="/boats">Open boats</Link>
	</main>
}
