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
			.shell {
				min-height: 100vh;
				display: flex;
				flex-direction: column;
			}
			.bar {
				position: sticky;
				top: 0;
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 12px;
				padding: 12px 20px;
				border-bottom: 1px solid var(--line);
				background: var(--paper);
			}
			.brand {
				font-size: 20px;
				font-weight: 600;
				text-decoration: none;
			}
			.links {
				display: flex;
				gap: 8px;
			}
			.link {
				padding: 8px 12px;
				border-radius: 999px;
				text-decoration: none;
				color: var(--muted);
			}
			.content {
				width: 100%;
				max-width: 880px;
				margin: 0 auto;
				padding: 20px;
			}
			@media (min-width: 700px) {
				.content {
					padding: 32px 40px;
				}
			}
		</style>
		<div class="shell">
			<title>{title}</title>
			<header class="bar">
				<Link href="/" class="brand">
					Notes
				</Link>
				<nav class="links" aria-label="Sections">
					<Link href="/tags" class="link">
						Tags
					</Link>
					<Link href="/new" class="button primary">
						New note
					</Link>
				</nav>
			</header>
			<main class="content">{children}</main>
		</div>
	</>
}
