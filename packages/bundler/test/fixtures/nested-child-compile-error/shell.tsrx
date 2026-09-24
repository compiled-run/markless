import type { Children } from '@markless/core';
import Panel from './panel.tsrx';
import { SECTIONS } from './sections.ts';

export default function Shell({ children }: { readonly children?: Children }) @{
	<div>
		<Panel section={SECTIONS[0]!} />
		{children}
	</div>
}
