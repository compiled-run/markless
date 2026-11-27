import { state } from '@markless/core';
import { native, platform } from '@markless/device';

export default function Index() @{
	let picked = state('');
	let choosing = state(false);
	let sizes = state(['Small', 'Medium', 'Large']);
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #f4f1de;
				color: #3d405b;
			}
			.title {
				font-size: 26px;
				font-weight: 700;
			}
			.open {
				display: block;
				margin-top: 16px;
				padding: 12px 20px;
				border: 2px solid #3d405b;
				border-radius: 12px;
				background: #ffffff;
				color: #3d405b;
				font-family: inherit;
				font-size: 18px;
			}
			.sheet {
				padding: 24px;
			}
			.sheet-title {
				margin: 0 0 12px;
				font-size: 20px;
			}
			.sizes {
				display: grid;
				gap: 8px;
			}
			.size {
				min-height: 48px;
				padding: 12px 16px;
				border: 2px solid #3d405b;
				border-radius: 12px;
				background: #ffffff;
				color: #3d405b;
				font-family: inherit;
				font-size: 18px;
				text-align: left;
			}
			.more {
				margin-top: 12px;
				padding: 8px 12px;
				border: 2px solid #e07a5f;
				border-radius: 12px;
				background: #ffffff;
				color: #e07a5f;
				font-family: inherit;
				font-size: 16px;
			}
		</style>
		<h1 class="title">Sizes</h1>
		<button class="open" onClick={() => (choosing = true)}>{picked === '' ? 'Pick a size' : picked}</button>
		@if (!platform.web) {
			<native.sheet open={choosing} onChange={(open) => (choosing = open)} snapPoints={[0.5, 1]}>
				<div class="sheet">
					<h2 class="sheet-title">Choose a size</h2>
					<div class="sizes" role="group" aria-label="Sizes">
						@for (const size of sizes; key size) {
							<button
								type="button"
								class="size"
								onClick={() => {
									picked = size;
									choosing = false;
								}}
							>
								{size}
							</button>
						}
					</div>
					<button type="button" class="more" onClick={() => (sizes = [...sizes, 'Extra large'])}>
						Add a size
					</button>
				</div>
			</native.sheet>
		} @else {
			<p>On the web, the sizes open in a drawer</p>
		}
	</main>
}
