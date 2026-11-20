const SPRITE = 'icons.svg';

function asset(path: string): string {
	return '/' + path.replace(/^\/+/, '');
}

function Icon({ name }: { readonly name: string }) @{
	const marks = asset(SPRITE) + '#';
	<svg role="img" aria-label="Leaf from the sprite" viewBox="0 0 24 24" width="96" height="96">
		<use href={marks + name} />
	</svg>
}

export default function App() @{
	const marks = asset(SPRITE) + '#';
	<main>
		<h1>Sprite</h1>
		<svg role="img" aria-label="Sun from the sprite" viewBox="0 0 48 48" width="96" height="96">
			<use href={marks + 'sun'} />
		</svg>
		<Icon name="leaf" />
		<p>Two icons from one sprite file</p>
	</main>
}
