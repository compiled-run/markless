const titles: Record<string, string> = { '/': 'Guide home', '/alpha': 'Alpha guide', '/beta': 'Beta guide' };
const next: Record<string, string> = { '/': '/alpha', '/alpha': '/beta', '/beta': '/' };

export default function Document({
	url,
	children,
}: {
	readonly url?: { readonly pathname: string };
	readonly children?: unknown;
}) @{
	const pathname = url?.pathname ?? '/';
	const title = titles[pathname] ?? 'Guide';

	<html
		lang="en"
		class={pathname === '/' ? 'shell shell-home' : 'shell'}
		data-page-shell={pathname}
		data-landing-only={pathname === '/' ? 'home' : undefined}
		data-mode="light"
		style={pathname === '/' ? 'scroll-behavior: smooth; --home: 1' : 'scroll-behavior: smooth'}
	>
		<head>
			<meta charset="utf-8" />
			<script>
				{'const root = document.documentElement; root.dataset.scripted = "yes"; root.dataset.mode = "dark"; root.classList.add("dark"); root.style.colorScheme = "dark";'}
			</script>
			<title>{title}</title>
			<meta name="description" content={`About ${title}`} />
			<link rel="canonical" href={`https://guide.test${pathname}`} />
			@if (pathname !== '/') {
				<link rel="stylesheet" href="/guide.css" />;
			}
		</head>
		<body
			class={pathname === '/' ? 'page page-home' : 'page'}
			data-body-page={pathname}
			style={pathname === '/' ? 'margin: 0; --body-home: 1' : 'margin: 0'}
		>
			<script>
				{'const body = document.body; body.classList.add("menu-open"); body.style.overflow = "hidden"; body.dataset.scrollLocked = "yes";'}
			</script>
			<header class="shell-header">
				<a href="/" data-crumb-home>Guide</a>
				<span class="crumb">{title}</span>
			</header>
			<main>{children}</main>
			<footer class="shell-pager">
				<span data-pager>{`after ${pathname}`}</span>
				<a href={next[pathname] ?? '/'} data-pager-next>Next</a>
				<a href="/notes.txt" data-pager-asset>Notes</a>
			</footer>
		</body>
	</html>;
}
