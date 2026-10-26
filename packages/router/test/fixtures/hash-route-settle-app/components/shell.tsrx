import type { Children } from '@markless/core';
import { navClass } from '../lib/nav.ts';

export default function Shell({ path, children }: { path: string; children?: Children }) @{
	<div class="shell">
		<a class={navClass(path, '/story')} href="/">home</a>
		{children}
	</div>
}
