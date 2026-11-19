import type { Children } from '@markless/core';
import { Link } from '@markless/router';

export default function Shell({
	title,
	tab,
	count,
	children,
}: {
	readonly title: string;
	readonly tab: 'shop' | 'categories' | 'cart' | 'account';
	/** Items in the cart, for the badge on the Cart tab. */
	readonly count: number;
	readonly children?: Children;
}) @{
	<>
		<style>
			.app {
				min-height: 100vh;
				padding-bottom: 84px;
			}
			.content {
				width: 100%;
				max-width: 1040px;
				margin: 0 auto;
				padding: 20px 16px;
			}
			.tabs {
				position: fixed;
				right: 0;
				bottom: 0;
				left: 0;
				display: grid;
				grid-template-columns: repeat(4, 1fr);
				border-top: 1px solid var(--line);
				background: var(--card);
			}
			.tab {
				position: relative;
				display: grid;
				justify-items: center;
				gap: 2px;
				padding: 10px 4px 14px;
				color: var(--muted);
				font-size: 13px;
				text-decoration: none;
			}
			.tab:active {
				background: var(--line);
			}
			.tab[aria-current='page'] {
				color: var(--accent);
				font-weight: 600;
			}
			.icon {
				font-size: 22px;
				line-height: 1;
			}
			.badge {
				position: absolute;
				top: 6px;
				left: calc(50% + 6px);
				min-width: 20px;
				padding: 1px 6px;
				border-radius: 999px;
				background: var(--danger);
				color: #ffffff;
				font-size: 12px;
				font-weight: 600;
			}
			@media (min-width: 700px) {
				.app {
					padding: 72px 0 0;
				}
				.tabs {
					top: 0;
					bottom: auto;
					grid-template-columns: repeat(4, 140px);
					justify-content: center;
					border-top: 0;
					border-bottom: 1px solid var(--line);
				}
				.content {
					padding: 32px;
				}
			}
		</style>
		<div class="app">
			<title>{title}</title>
			<main class="content">{children}</main>
			<nav class="tabs" aria-label="Sections">
				<Link href="/" class="tab" aria-current={tab === 'shop' ? 'page' : undefined}>
					<span class="icon" aria-hidden="true">◎</span>
					Shop
				</Link>
				<Link
					href="/categories"
					class="tab"
					aria-current={tab === 'categories' ? 'page' : undefined}
				>
					<span class="icon" aria-hidden="true">▤</span>
					Categories
				</Link>
				<Link href="/cart" class="tab" aria-current={tab === 'cart' ? 'page' : undefined}>
					<span class="icon" aria-hidden="true">◫</span>
					Cart
					<span class="badge" hidden={count === 0} aria-label={`${count} in cart`}>
						{count}
					</span>
				</Link>
				<Link href="/account" class="tab" aria-current={tab === 'account' ? 'page' : undefined}>
					<span class="icon" aria-hidden="true">◍</span>
					Account
				</Link>
			</nav>
		</div>
	</>
}
