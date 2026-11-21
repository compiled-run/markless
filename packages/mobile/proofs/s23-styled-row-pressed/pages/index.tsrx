import { state } from '@markless/core';

export default function Sizes() @{
	let picked = state('Medium');
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #f8f9fa;
			}
			.heading {
				font-size: 26px;
				font-weight: 700;
				color: #212529;
			}
			.sizes {
				display: flex;
				flex-direction: column;
				gap: 8px;
				margin-top: 16px;
			}
			.size {
				display: block;
				width: 100%;
				padding: 10px 16px;
				border: 1px solid #ced4da;
				border-radius: 10px;
				background: #ffffff;
				color: #212529;
				font-family: inherit;
				font-size: 17px;
				text-align: left;
			}
			.size[aria-pressed='true'] {
				padding: 18px 16px;
				border: 2px solid #264653;
				background: #e9f5f9;
				font-weight: 700;
			}
			.footer {
				margin-top: 24px;
				padding-top: 12px;
				border-top: 1px solid #adb5bd;
				color: #495057;
				font-size: 15px;
			}
		</style>
		<title>Sizes</title>
		<h1 class="heading">Sizes</h1>
		<div class="sizes" role="group" aria-label="Sizes">
			@for (const size of ['Small', 'Medium', 'Large']; key size) {
				<button type="button" class="size" aria-pressed={size === picked} onClick={() => (picked = size)}>
					{size}
				</button>
			}
		</div>
		<footer class="footer">Picked {picked}</footer>
	</main>
}
