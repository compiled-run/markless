import { Link } from '@markless/router';

export default function Note() @{
	<main class="note">
		<style>
			.note {
				padding: 24px;
				background: #ffffff;
				color: #1d1b16;
				font-size: 18px;
			}
			.title {
				margin: 0 0 12px;
				font-size: 24px;
			}
			.back {
				display: block;
				padding: 8px 0;
			}
		</style>
		<h2 class="title">The ring note</h2>
		<Link href="/" class="back">Back home</Link>
	</main>
}
