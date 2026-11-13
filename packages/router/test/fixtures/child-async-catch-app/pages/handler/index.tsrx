const pages = [
	'around-page',
	'around-same',
	'around-other',
	'around-deep',
	'around-static-page',
	'around-static-same',
	'around-static-other',
	'around-static-deep',
	'inside-same',
	'inside-other',
	'inside-deep',
	'inside-static-same',
	'inside-static-other',
	'inside-static-deep',
	'none-page',
	'none-same',
	'none-other',
	'none-deep',
];

export default function Index() @{
	<main>
		<nav>
			@for (const page of pages; key page) {
				<a href={`/handler/${page}`}>{page}</a>
			}
		</nav>
	</main>
}
