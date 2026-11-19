export default function App() @{
	<main class="page">
		<style>
			.page {
				padding: 16px;
			}
			.title {
				margin: 0 0 12px;
				height: 40px;
				font-size: 24px;
			}
			.row {
				display: flex;
				gap: 12px;
				height: 200px;
				overflow-x: auto;
				border: 2px solid #1d1b16;
			}
			.card {
				flex: 0 0 160px;
				margin: 0;
				padding: 12px;
				font-size: 18px;
				background: #ffd166;
			}
		</style>
		<h1 class="title">Scroll row</h1>
		<div class="row">
			<p class="card">Card 1</p>
			<p class="card">Card 2</p>
			<p class="card">Card 3</p>
			<p class="card">Card 4</p>
			<p class="card">Card 5</p>
			<p class="card">Card 6</p>
			<p class="card">Card 7</p>
			<p class="card">Card 8</p>
			<p class="card">Card 9</p>
			<p class="card">Card 10</p>
			<p class="card">Card 11</p>
			<p class="card">Card 12</p>
		</div>
		<p>Below the row</p>
	</main>
}
