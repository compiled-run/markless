import type { Children } from 'ripple';
import { ROUTES, SIDEBAR_TREE, SITE_TITLE, documentTitle, type RouteId } from '../shared/data.ts';
import { TreeGroup } from './TreeGroup.tsrx';

export function AppShell({ route, children }: { route: RouteId; children: Children }) @{
	const current = ROUTES.find((info) => info.id === route)!;

	<>
		<head>
			<title>{documentTitle(current)}</title>
		</head>
		<div class="app">
			<header class="app-header">
				<span class="app-brand">{SITE_TITLE}</span>
				<nav class="app-nav" aria-label="Main">
					@for (const info of ROUTES; key info.id) {
						<a
							data-testid={info.navTestId}
							href={info.path}
							aria-current={info.id === route ? 'page' : undefined}
						>
							{info.title}
						</a>
					}
				</nav>
			</header>
			<div class="app-body">
				<aside class="sidebar" aria-label="Sections">
					<ul class="tree">
						@for (const node of SIDEBAR_TREE; key node.id) {
							<TreeGroup {node} />
						}
					</ul>
				</aside>
				<main class="main">
					<h1 class="page-title" data-testid="page-title">{current.title}</h1>
					{children}
				</main>
			</div>
		</div>
	</>
}
