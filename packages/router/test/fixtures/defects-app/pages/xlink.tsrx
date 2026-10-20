import { state } from '@markless/core';

export default function XlinkPage() @{
	let target = state('#dot');
	let shown = state(false);
	<main>
		<svg data-svg xmlns:xlink="http://www.w3.org/1999/xlink">
			<symbol id="dot"><circle r="1" /></symbol>
			<symbol id="ring"><circle r="2" /></symbol>
			<use data-use xlink:href="#dot" href="#dot" />
			<use data-moving xlink:href={target} />
			<text data-space xml:space="preserve">{'a  b'}</text>
			@if (shown) {
				<use data-arm xlink:href="#ring" />
			}
		</svg>
		<button data-retarget onClick={() => (target = target === '#dot' ? '#ring' : '#dot')}>
			{'retarget'}
		</button>
		<button data-show onClick={() => (shown = !shown)}>{'show'}</button>
	</main>;
}
