import { state } from '@markless/core';

const ICONS: Record<string, string> = {
	star: 'M8 0L10 6H16L11 10L13 16L8 12L3 16L5 10L0 6H6Z',
	heart: 'M0 4L8 16L16 4L8 0Z',
};

function Icon({ name }: { readonly name: string }) @{
	const path = ICONS[name.replace(/^octicon-/, '')] ?? ICONS.star!;
	<svg viewBox="0 0 16 16" width="48" height="48" fill="#e76f51" role="img" aria-label={`Icon ${name}`}>
		<path d={path}></path>
	</svg>
}

export default function App() @{
	let turned = state(false);
	<main>
		<h1>Live paths</h1>
		<Icon name="octicon-heart" />
		<svg viewBox="0 0 16 16" width="48" height="48" role="img" aria-label="Corner mark">
			<rect width="16" height="16" fill="#eeeeee" />
			<path d={turned ? 'M0 0H16V16Z' : 'M0 0H16L0 16Z'} fill="#264653" />
		</svg>
		<button onClick={() => (turned = !turned)}>{turned ? 'Turn back' : 'Turn mark'}</button>
	</main>
}
