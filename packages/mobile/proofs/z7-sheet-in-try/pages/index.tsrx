import { computed, state } from '@markless/core';
import { native, platform } from '@markless/device';
import { loadSizes } from '../lib/sizes.ts';

function Size({
	size,
	picked,
	onPick,
}: {
	readonly size: string;
	readonly picked: string;
	readonly onPick: (size: string) => void;
}) @{
	<>
		<style>
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
			.size[aria-pressed='true'] {
				border-color: #e07a5f;
				font-weight: 700;
			}
		</style>
		<button type="button" class="size" aria-pressed={size === picked} onClick={() => onPick(size)}>
			{size}
		</button>
	</>
}

export default function Index() @{
	let picked = state('');
	let choosing = state(false);
	const sizes = computed(async () => loadSizes());
	const pick = (size: string) => {
		picked = size;
		choosing = false;
	};
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
			.sizes {
				display: grid;
				gap: 8px;
			}
			.sheet-title {
				margin: 0 0 12px;
				font-size: 20px;
			}
		</style>
		<h1 class="title">Sizes</h1>
		@try {
			<>
				<button class="open" onClick={() => (choosing = true)}>
					{picked === '' ? sizes.prompt : picked}
				</button>
				@if (!platform.web) {
					<native.sheet open={choosing} onChange={(open) => (choosing = open)} snapPoints={[0.5]}>
						<div class="sheet">
							<h2 class="sheet-title">Choose a size</h2>
							<div class="sizes" role="group" aria-label="Sizes">
								<Size size="Small" picked={picked} onPick={pick} />
								<Size size="Medium" picked={picked} onPick={pick} />
								<Size size="Large" picked={picked} onPick={pick} />
							</div>
						</div>
					</native.sheet>
				} @else {
					<p>On the web, the sizes open in a drawer</p>
				}
			</>
		} @pending {
			<p>Loading sizes</p>
		}
	</main>
}
