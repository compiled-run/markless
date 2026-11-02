import { navbar } from '../../index.ts';

// A floating panel with a gap between it and its trigger, like a docs header's: the pointer
// crosses page that belongs to no part on its way down, and the bar holds a plain link the
// pointer can slide to without leaving the landmark.
export default function SafeZone() @{
	<div class="stage">
		<navbar.root aria-label="Primary" delay={60} switchDelay={60} clickGrace={0} class="bar" data-testid="root">
			<navbar.item value="products" data-testid="products-item">
				<navbar.itemtrigger class="trigger" data-testid="products-itemtrigger">Products</navbar.itemtrigger>
				<navbar.itemcontent class="panel" data-testid="products-itemcontent">
					<navbar.itemlink href="/products/keyboards" data-testid="keyboards-itemlink">Keyboards</navbar.itemlink>
				</navbar.itemcontent>
			</navbar.item>
			<navbar.item value="docs" data-testid="docs-item">
				<navbar.itemtrigger class="trigger" data-testid="docs-itemtrigger">Docs</navbar.itemtrigger>
				<navbar.itemcontent class="panel" data-testid="docs-itemcontent">
					<navbar.itemlink href="/docs/start" data-testid="start-itemlink">Getting started</navbar.itemlink>
				</navbar.itemcontent>
			</navbar.item>
			<navbar.itemlink href="/pricing" class="far" data-testid="pricing-itemlink">Pricing</navbar.itemlink>
			<navbar.item value="blog" data-testid="blog-item">
				<navbar.itemlink href="/blog" data-testid="blog-itemlink">Blog</navbar.itemlink>
			</navbar.item>
		</navbar.root>
		<div class="gap" data-testid="gap"></div>
		<button type="button" class="signin" data-testid="signin">Sign in</button>

		<style>
			.stage {
				position: relative;
				block-size: 400px;
			}

			.bar {
				display: flex;
				align-items: center;
				gap: 8px;
				block-size: 40px;
			}

			.trigger {
				block-size: 40px;
				inline-size: 90px;
			}

			.far {
				margin-inline-start: 320px;
			}

			.panel {
				position: absolute;
				top: 64px;
				left: 0;
				inline-size: 200px;
				block-size: 120px;
				background: #eee;
			}

			.gap {
				position: absolute;
				top: 44px;
				left: 20px;
				inline-size: 40px;
				block-size: 16px;
			}

			.signin {
				position: absolute;
				top: 300px;
				left: 500px;
			}
		</style>
	</div>
}
