import { state } from '@markless/core';

export function Shell({ children }) @{
	<div class="shell" data-shell>{children}</div>
}

export default function DefaultRootLayout({ children }) @{
	let opened = state(0);
	<section class="frame" data-frame>
		<button type="button" data-open onClick={() => { opened = opened + 1; }}>{opened}</button>
		<Shell>{children}</Shell>
	</section>
}
