export default function Notes() @{
	<main class="notes">
		<style>
			.notes {
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
		<title>Notes</title>
		<h1 class="heading">Watering</h1>
		<p class="line">Mist the tray each morning</p>
	</main>
}
