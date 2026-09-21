import { headFor, siteOrigin } from './nav.ts';
import Pager from './components/docs/pager.tsrx';
import SiteHeader from './components/docs/site-header.tsrx';
import stylesheet from './styles/global.css?url';
import brandStylesheet from './styles/brand.css?url';

export default function Document({
	url,
	children,
}: {
	readonly url?: { readonly pathname: string };
	readonly children?: unknown;
}) @{
	const pathname = (url?.pathname ?? '/').replace(/\/+$/, '') || '/';
	const head = headFor(pathname);
	const canonical = `${siteOrigin}${pathname}`;
	const examplePage = pathname.startsWith('/markless/examples/accordion/');
	const previewTheme = examplePage ? 'light' : undefined;

	<html lang="en" data-theme={previewTheme} class={previewTheme}>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			@if (previewTheme) {
				<meta name="color-scheme" content="light" />;
			}
			<title>{head.title}</title>
			<meta name="description" content={head.description} />
			<link rel="canonical" href={canonical} />
			<meta property="og:type" content="website" />
			<meta property="og:site_name" content="Markless docs" />
			<meta property="og:title" content={head.title} />
			<meta property="og:description" content={head.description} />
			<meta property="og:url" content={canonical} />
			<meta name="twitter:card" content="summary" />
			<link rel="icon" href="/markless/favicon.svg" type="image/svg+xml" />
			<link rel="apple-touch-icon" href="/markless/mascots/markless.png" />
			<link rel="stylesheet" href={stylesheet} />
			<link rel="stylesheet" href={brandStylesheet} />
			<script src="/markless/theme.js"></script>
			<script src="/markless/mascot.js"></script>
			<script type="module" src="/markless/outline.js"></script>
			@if (examplePage) {
				<script type="module" src="/markless/accordion-preview.js"></script>;
			}
		</head>
		<body>
			<style>
				/* Unconditional rules first, the narrow-viewport media queries last: a query adds no specificity. */
				.site-shell {
					padding-inline: var(--space-s-l);
				}
				.example-shell { width:100%; margin:0; padding:0; }

				@media (max-width: 96rem) {
					.site-shell {
						padding-left: calc(16rem + 2 * var(--space-s-l));
						padding-right: calc(11rem + 2 * var(--space-s-l));
					}
				}

				@media (max-width: 70rem) {
					.site-shell {
						padding-inline: var(--space-s-l);
					}
				}
			</style>
			@if (examplePage) {
				<main class="example-shell">{children}</main>;
			} @else {
				<div class="docs-shell">
					<SiteHeader pathname={pathname} />
					<div class="site-shell">
						<main class="prose">
							{children}
							<Pager pathname={pathname} />
						</main>
					</div>
				</div>;
			}
		</body>
	</html>;
}
