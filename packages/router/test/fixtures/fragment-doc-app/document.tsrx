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

	<html lang="en" data-page-shell={pathname}>
		<head>
			<meta charset="utf-8" />
			<title>{title}</title>
			<meta name="description" content={`About ${title}`} />
			<link rel="canonical" href={`https://guide.test${pathname}`} />
		</head>
		<body>
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
