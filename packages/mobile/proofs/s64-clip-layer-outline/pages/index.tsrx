export default function Cards() @{
	<main class="page">
		<style>
			.page {
				display: flex;
				gap: 28px;
				padding: 32px 24px;
				background: #f3f1ea;
			}
			.card {
				width: 120px;
				height: 90px;
				overflow: hidden;
				background: #ffffff;
				font-size: 17px;
				color: #2b2620;
			}
			.pressed {
				border: 1px solid #c9c1b0;
				border-radius: 14px;
				transform: scale(0.97);
				outline: 3px solid #1f6feb;
				outline-offset: 2px;
			}
			.lifted {
				position: relative;
				outline: 4px solid #d1495b;
				outline-offset: 3px;
			}
			.photo {
				width: 180px;
				height: 50px;
				background: #e9a23b;
			}
		</style>
		<title>Outlined cards</title>
		<div class="card pressed">
			<div class="photo"></div>
			Groceries
		</div>
		<div class="card lifted">
			<div class="photo"></div>
			Plumber
		</div>
	</main>
}
