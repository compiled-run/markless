import type { Children } from '@markless/core';
import { headFor, siteOrigin } from './nav.ts';
import { findError } from './components/docs/errors/lookup.ts';
import { findApp } from './components/docs/showcase/view.ts';
import { asset } from './site-base.ts';
import Pager from './components/docs/pager.tsrx';
import stylesheet from './styles/global.css?url';
import brandStylesheet from './styles/brand.css?url';
import joyEliaRegular from './styles/fonts/JoyElia-Regular.woff2?url';
import joyEliaBold from './styles/fonts/JoyElia-Bold.woff2?url';
import shantellSans from './styles/fonts/ShantellSans-latin-variable.woff2?url';

export default function Document({
	url,
	children,
}: {
	readonly url?: { readonly pathname: string };
	readonly children?: Children;
}) @{
	const pathname = (url?.pathname ?? '/').replace(/\/+$/, '') || '/';
	const head = headFor(pathname, findError, findApp);
	const canonical = `${siteOrigin}${pathname}`;
	const examplePage = pathname.startsWith('/examples/accordion/');
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
			<link rel="icon" href={asset('favicon-mug.svg')} type="image/svg+xml" />
			<link rel="apple-touch-icon" href={asset('markless-mug-icon.png')} />
			<link rel="preload" href={joyEliaRegular} as="font" type="font/woff2" crossorigin="anonymous" />
			<link rel="preload" href={joyEliaBold} as="font" type="font/woff2" crossorigin="anonymous" />
			<link rel="preload" href={shantellSans} as="font" type="font/woff2" crossorigin="anonymous" />
			<link rel="stylesheet" href={stylesheet} />
			<link rel="stylesheet" href={brandStylesheet} />
			<script src={asset('theme.js')}></script>
			<script src={asset('mascot.js')}></script>
			<script type="module" src={asset('outline.js')}></script>
			<script type="module" src={asset('navbar.js')}></script>
			@if (examplePage) {
				<script type="module" src={asset('accordion-preview.js')}></script>;
			}
		</head>
		<body>
			<style>
				/* Unconditional rules first, the narrow-viewport media queries last: a query adds no specificity. */
				.site-shell {
					padding-inline: var(--space-s-l);
					padding-block-start: var(--navbar-clear);
				}
				.example-shell { width:100%; margin:0; padding:0; }

				@media (max-width: 96rem) {
					.site-shell {
						padding-left: calc(16rem + 2 * var(--space-s-l));
						padding-right: calc(11rem + 2 * var(--space-s-l));
					}
				}

				/* The tracks beside the article, for what grows into its width. A closed sidebar leaves a button's width; the attribute is painted before content, so the first frame is already right. */
				@media (min-width: 70.01rem) {
					.site-shell {
						--sidebar-track: calc(16rem + var(--space-s-l));
						--rail-track: calc(11rem + var(--space-s-l));
					}

					.site-shell .prose {
						view-transition-name: docs-main;
					}

					html[data-sidebar='closed'] .site-shell {
						--sidebar-track: 3rem;
						padding-left: calc(var(--space-s-l) + 3rem);
						padding-right: calc(11rem + 2 * var(--space-s-l));
					}
				}

				@media (min-width: 96.01rem) {
					.site-shell {
						--rail-track: calc(16rem + var(--space-s-l));
					}
				}

				/* Opening or closing the sidebar: it slides as one opaque image, and the article's final image glides into place, so nothing cross-fades. */
				html::view-transition-group(docs-sidebar),
				html::view-transition-group(docs-main),
				html::view-transition-group(docs-sidebar-open) {
					animation-duration: 200ms;
					animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
				}

				html::view-transition-old(docs-sidebar),
				html::view-transition-new(docs-sidebar) {
					animation: none;
				}

				html::view-transition-old(docs-main) {
					display: none;
				}

				html::view-transition-new(docs-main) {
					animation: none;
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
