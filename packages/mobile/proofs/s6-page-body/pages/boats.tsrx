export default function Boats() @{
	<main class="boats">
		<style>
			.boats {
				padding: 24px;
			}
			.heading {
				font-size: 24px;
				font-weight: 700;
				color: #3d405b;
			}
			.line {
				margin-top: 12px;
				font-size: 17px;
				color: #3d405b;
			}
			@media (prefers-color-scheme: dark) {
				.heading,
				.line {
					color: #f4efe6;
				}
			}
		</style>
		<title>Boats</title>
		<h1 class="heading">Moorings</h1>
		<p class="line">Three boats are out</p>
	</main>
}
