// Self-contained on purpose: the fixture proves what markless-tsc sees in a .tsrx, so it
// pulls in no workspace package whose own sources would join the program.
type CounterProps = {
	readonly start: number;
	readonly label: string;
};

export function Counter({ start, label }: CounterProps) @{
	const total: number = start + 1;

	<button type="button" tabindex={total}>
		{label}
	</button>
}

export function DocumentHead() @{
	<head>
		<meta property="og:title" content="A page title" />
		<link rel="preload" href="/font.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
		<script src="/theme.js" type="module" async defer crossorigin="anonymous"></script>
	</head>
}
