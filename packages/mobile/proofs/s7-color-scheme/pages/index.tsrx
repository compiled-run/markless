import { state } from '@markless/core';

export default function Shelf() @{
	let presses = state(0);
	<main class="shelf">
		<style>
			.shelf {
				padding: 24px;
			}
			.heading {
				font-size: 26px;
				font-weight: 700;
			}
			.accent {
				color: #1d4ed8;
				font-size: 17px;
			}
			.press {
				display: block;
				font-family: inherit;
				margin-top: 16px;
				padding: 10px 18px;
				border: 2px solid #22223b;
				border-radius: 10px;
				background: #8d99ae;
				font-size: 18px;
			}
			@media (prefers-color-scheme: dark) {
				.accent {
					color: #93c5fd;
				}
			}
		</style>
		<title>Night shelf</title>
		<h1 class="heading">Seeds at night</h1>
		<p>Plain text takes the scheme's colour</p>
		<p class="accent">The accent has its own dark colour</p>
		<button class="press" onClick={() => presses++}>Pressed {presses}</button>
	</main>
}
