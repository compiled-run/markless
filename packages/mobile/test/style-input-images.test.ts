import { expect, test } from 'vitest';
import { compileNativeComponent } from '../src/compile.ts';
import { nativeStyleInput } from '../src/style-input.ts';

const imgsOf = async (body: string) => {
	const build = await compileNativeComponent({
		filename: 'packages/mobile/test/fixtures/RuntimeImages.tsrx',
		source: `import { state } from '@markless/core';

export default function App() @{
${body}
}`,
	});
	expect(build.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
	return nativeStyleInput(build.payload!, build.styles).nodes.flatMap((node) =>
		node.kind === 'element' && node.element === 'img' ? [node] : [],
	);
};

test('an <img> whose src follows state goes to Dragon with runtimeSrc and no src; a fixed src stays as it is', async () => {
	const imgs = await imgsOf(`	let photos = state([{ id: 'a', file: '/a.png', shot: '' }, { id: 'b', file: '/b.png', shot: '/b.jpg' }]);
	let cover = state('/cover.png');
	<section>
		<style>.tile { width: 40px; height: 40px; }</style>
		<img class="tile" src="/logo.png" alt="Logo" />
		<img class="tile" src={cover} alt="" />
		@for (const photo of photos; key photo.id) {
			<>
				<img class="tile" src={photo.file} alt="" />
				<img class="tile" src={photo.shot === '' ? undefined : photo.shot} alt="" />
			</>
		}
	</section>`);
	expect(imgs.map((img) => [img.attributes['src'] ?? null, img.attributes['alt'], img.runtimeSrc ?? null])).toEqual([
		['/logo.png', 'Logo', null],
		[null, '', { absent: false }],
		[null, '', { absent: false }],
		[null, '', { absent: true }],
	]);
});

test('a src is absent when the expression can give null: an optional chain, a ?? fallback, an index read, or a cell that starts or is set empty', async () => {
	const imgs = await imgsOf(`	let picked = state(null as null | { readonly url: string });
	let urls = state(['/one.png']);
	let later = state('/first.png');
	let fallback = state('');
	<section>
		<style>.tile { width: 40px; height: 40px; }</style>
		<img class="tile" src={picked?.url} alt="" />
		<img class="tile" src={fallback || null} alt="" />
		<img class="tile" src={urls[0]} alt="" />
		<img class="tile" src={later} alt="" />
		<img class="tile" src={fallback === '' ? '/none.png' : fallback} alt="" />
		<button type="button" onClick={() => (later = null)}>Clear</button>
	</section>`);
	expect(imgs.map((img) => img.runtimeSrc)).toEqual([
		{ absent: true },
		{ absent: true },
		{ absent: true },
		{ absent: true },
		{ absent: false },
	]);
});

test('a page with an <img> whose src follows state packages every image the app serves that a phone can draw; a page without one packages none', async () => {
	const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 3, 0, 0, 0, 2]);
	const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"><rect width="8" height="4" fill="#123456"/></svg>');
	const styled = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"><style>rect{fill:red}</style><rect width="8" height="4"/></svg>');
	const served: Record<string, Uint8Array> = { '/art/a.png': png, '/art/b.svg': svg, '/art/c.svg': styled, '/notes.txt': new Uint8Array([1, 2]) };
	const build = (body: string) =>
		compileNativeComponent({
			filename: 'packages/mobile/test/fixtures/ServedImages.tsrx',
			source: `import { state } from '@markless/core';

export default function App() @{
	let src = state('/art/a.png');
	<main>${body}</main>
}`,
			listServedFiles: () => Object.keys(served),
			readServedFile: (href) => (served[href] ? { file: `public${href}`, bytes: served[href]! } : undefined),
		});
	const bound = await build('<img src={src} alt="" />');
	expect(bound.images.map((image) => [image.src, image.format, image.width, image.height])).toEqual([
		['/art/a.png', 'png', 3, 2],
		['/art/b.svg', 'svg', 8, 4],
	]);
	expect(bound.payload).not.toBeNull();
	expect((await build('<img src="/art/b.svg" alt="" />')).images.map((image) => image.src)).toEqual(['/art/b.svg']);
});
