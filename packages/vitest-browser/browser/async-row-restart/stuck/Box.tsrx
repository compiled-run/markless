import type { Children } from '@markless/core';

export default function Box({ children }: { children?: Children }) @{
	<div class="box">{children}</div>
}
