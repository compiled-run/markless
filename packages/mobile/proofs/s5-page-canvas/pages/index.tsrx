import { Link } from '@markless/router';

export default function Garden() @{
	<main class="garden">
		<style>
			.garden {
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
		<title>Garden</title>
		<h1 class="heading">Seed tray</h1>
		<Link class="next" href="/notes">Open notes</Link>
	</main>
}
