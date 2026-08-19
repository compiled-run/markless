import type { Children } from '@markless/core';

export function Nav({ label, active, children }: { label: string; active?: boolean; children?: Children }) @{
	<nav data-active={active ? 'yes' : 'no'}>{label}{children}</nav>
}

export const navLabel = 'Navigation';
