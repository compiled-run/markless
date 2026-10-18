const LINKS = [
	{ href: '/', label: 'Home' },
	{ href: '/start-here', label: 'Start here' },
	{ href: '/directives', label: 'Directives' },
];

export function SideNav({ pathname }: { readonly pathname: string }) @{
	<ul data-nav>
		@for (const link of LINKS; key link.href) {
			<li data-href={link.href} class={pathname === link.href ? 'active' : 'idle'}>
				{link.label}
			</li>
		}
	</ul>
}
