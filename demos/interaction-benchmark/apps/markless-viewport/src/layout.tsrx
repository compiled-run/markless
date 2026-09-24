import type { Children } from '@markless/core';
import { Link } from '@markless/router';
import Disclosure from './disclosure.tsrx';
import { ROUTES, SIDEBAR_TREE, SITE_TITLE, documentTitle, type RouteId } from './shared/data.ts';

export default function Layout({
	route,
	children,
}: {
	readonly route: RouteId;
	readonly children?: Children;
}) @{
	const current = ROUTES.find((info) => info.id === route)!;

	<div class="app">
		<title>{documentTitle(current)}</title>
		<header class="app-header">
			<span class="app-brand">{SITE_TITLE}</span>
			<nav class="app-nav" aria-label="Main">
				<Link href="/" data-testid="nav-overview" aria-current={route === 'overview' ? 'page' : undefined}>Overview</Link>
				<Link href="/records" data-testid="nav-records" aria-current={route === 'records' ? 'page' : undefined}>Records</Link>
				<Link href="/settings" data-testid="nav-settings" aria-current={route === 'settings' ? 'page' : undefined}>Settings</Link>
			</nav>
		</header>
		<div class="app-body">
			<aside class="sidebar" aria-label="Sections">
				<ul class="tree">
					<Disclosure node={SIDEBAR_TREE[0]!}>
						<Disclosure node={SIDEBAR_TREE[0]!.children![1]!} />
					</Disclosure>
					<Disclosure node={SIDEBAR_TREE[1]!}>
						<Disclosure node={SIDEBAR_TREE[1]!.children![1]!} />
					</Disclosure>
				</ul>
			</aside>
			<main class="main">
				<h1 class="page-title" data-testid="page-title">{current.title}</h1>
				{children}
			</main>
		</div>
	</div>
}
