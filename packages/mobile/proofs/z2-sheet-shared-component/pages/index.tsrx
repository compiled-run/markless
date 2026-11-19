import { state } from '@markless/core';
import { native, platform } from '@markless/device';
import { Tag } from '../lib/Tag.tsrx';

export default function Index() @{
	let looking = state(false);
	<main class="shelf">
		<style>
			.shelf {
				padding: 24px;
			}
			.name {
				font-size: 26px;
				font-weight: 700;
				color: #1b4332;
			}
			.more {
				display: block;
				margin-top: 16px;
				padding: 12px 20px;
				border: 2px solid #1b4332;
				border-radius: 12px;
				background: #ffffff;
				color: #1b4332;
				font-family: inherit;
				font-size: 18px;
			}
			.detail {
				padding: 24px;
			}
		</style>
		<h1 class="name">Basil</h1>
		<Tag label="In season" />
		<button class="more" onClick={() => (looking = true)}>More about basil</button>
		@if (!platform.web) {
			<native.sheet open={looking} onChange={(open) => (looking = open)}>
				<div class="detail">
					<h2 class="name">Sweet basil</h2>
					<Tag label="In season" />
					<Tag label="Grown nearby" />
				</div>
			</native.sheet>
		} @else {
			<p>On the web, the details open in a drawer</p>
		}
	</main>
}
