import type { Children } from '@markless/core';
import { Link } from '@markless/router';

export default function Shell({
	title,
	children,
}: {
	readonly title: string;
	readonly children?: Children;
}) @{
	<>
		<style>
			.bar {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 12px;
				padding: 12px 16px;
				border-bottom: 1px solid var(--line);
				background: var(--card);
			}
			.brand {
				font-size: 19px;
				font-weight: 600;
				text-decoration: none;
			}
			.links {
				display: flex;
				gap: 4px;
			}
			.link {
				padding: 8px 10px;
				border-radius: 10px;
				color: var(--muted);
				text-decoration: none;
			}
			.link:active {
				background: var(--line);
			}
			.content {
				display: grid;
				gap: 18px;
				width: 100%;
				max-width: 760px;
				margin: 0 auto;
				padding: 20px 16px 40px;
			}
			@media (min-width: 700px) {
				.content {
					padding: 32px;
				}
			}
		</style>
		<title>{title}</title>
		<header class="bar">
			<Link href="/" class="brand">
				Field notes
			</Link>
			<nav class="links" aria-label="Sections">
				<Link href="/permissions" class="link">
					Access
				</Link>
				<Link href="/settings" class="link">
					Settings
				</Link>
			</nav>
		</header>
		<main class="content">{children}</main>
	</>
}
