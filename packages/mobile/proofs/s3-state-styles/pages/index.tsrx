import { Link } from '@markless/router';

export default function Home() @{
	<main class="home">
		<style>
			.home {
				padding: 24px;
				background: #f8f9fa;
			}
			.heading {
				font-size: 26px;
				font-weight: 700;
				color: #212529;
			}
			.next {
				display: block;
				margin-top: 16px;
				padding: 10px 16px;
				border-radius: 10px;
				background: #264653;
				color: #ffffff;
				font-size: 17px;
				text-decoration: none;
			}
		</style>
		<title>Home</title>
		<h1 class="heading">Account</h1>
		<Link class="next" href="/settings">Open settings</Link>
	</main>
}
