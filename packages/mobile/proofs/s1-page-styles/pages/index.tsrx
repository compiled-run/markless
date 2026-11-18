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
				color: #1d1b16;
			}
			.lead {
				font-size: 17px;
				color: #4a4637;
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
		<title>Plants</title>
		<h1 class="heading">Your plants</h1>
		<p class="lead">Three need water today.</p>
		<Link class="next" href="/care">Open care guide</Link>
	</main>
}
