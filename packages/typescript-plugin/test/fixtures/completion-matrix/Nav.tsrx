export function Nav({ label, active, children }: { label: string; active?: boolean; children?: unknown }) @{
	<nav data-active={active ? 'yes' : 'no'}>{label}{children}</nav>
}

export const navLabel = 'Navigation';
