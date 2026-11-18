import { state } from '@markless/core';

// website/components/figures/routes/model.ts typeSlug, called from routes-anatomy.tsrx:142.
function typeSlug(slug: string, key: string): string {
	if (key === 'Backspace') return slug.slice(0, -1);
	if (/^[a-z0-9-]$/i.test(key) && slug.length < 12) return slug + key.toLowerCase();
	return slug;
}

export function App() @{
	let slug = state('hell');
	<main>
		<p>{`/blog/${slug}`}</p>
		<button onClick={() => (slug = typeSlug(slug, 'O'))}>Type O</button>
		<button onClick={() => (slug = typeSlug(slug, '/'))}>Type slash</button>
		<button onClick={() => (slug = typeSlug(slug, 'Backspace'))}>Backspace</button>
	</main>
}
