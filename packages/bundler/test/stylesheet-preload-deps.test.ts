import { expect, test } from 'vitest';
import { stylesheetlessPreloads } from '../src/build/stylesheet-preload-deps.ts';
import { stripEmptyVitePreloadWrappers } from '../src/build/preload-cleanup.ts';

const table = (files: readonly string[]) =>
	`const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=${JSON.stringify(files)})))=>i.map(i=>d[i]);\n`;

test('a dynamic import stops waiting for stylesheets the documents carry, and the table goes once nothing reads it', () => {
	const code = `${table(['assets/shared.css', 'assets/page.css'])}const load=()=>e(()=>import("./page.js"),__vite__mapDeps([0,1]));export{load};`;
	const next = stylesheetlessPreloads('chunk.js', code, ['assets/shared.css', 'assets/page.css']);
	expect(next).not.toContain('__vite__mapDeps');
	expect(next).toContain('e(()=>import("./page.js"),[])');
	expect(stripEmptyVitePreloadWrappers(next)).toContain('const load=()=>import("./page.js")');
});

test('a file the documents do not carry stays a dependency, and so does its table', () => {
	const code = `${table(['assets/page.css', 'build/other.js'])}const a=()=>e(()=>import("./a.js"),__vite__mapDeps([0,1]));const b=()=>e(()=>import("./b.js"),__vite__mapDeps([0]));export{a,b};`;
	const next = stylesheetlessPreloads('chunk.js', code, ['assets/page.css']);
	expect(next).toContain('__vite__mapDeps([1])');
	expect(next).toContain('e(()=>import("./b.js"),[])');
	expect(next).toContain('m.f=["assets/page.css","build/other.js"]');
});

test('a chunk with no stylesheet dependency is left as it is', () => {
	const code = `${table(['build/other.js'])}const a=()=>e(()=>import("./a.js"),__vite__mapDeps([0]));export{a};`;
	expect(stylesheetlessPreloads('chunk.js', code, ['assets/page.css'])).toBe(code);
});

test('with a relative base, a file written relative to the chunk is matched to the stylesheet it names', () => {
	const code = `${table(['../assets/page.css'])}const a=()=>e(()=>import("./a.js"),__vite__mapDeps([0]));export{a};`;
	const next = stylesheetlessPreloads('build/chunk.js', code, ['assets/page.css']);
	expect(next).toContain('e(()=>import("./a.js"),[])');
});
