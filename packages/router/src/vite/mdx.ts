import type { Plugin } from 'vite';
import { extname } from 'pathe';
import { decodePath, parseURL } from 'ufo';

export function mdxTransformPlugin(): Plugin {
	return {
		name: 'arcade-router:mdx',
		enforce: 'pre',
		transform: {
			order: 'pre',
			async handler(code, id) {
				if (!isMdxFile(id)) {
					return;
				}

				return {
					code: await transformMdxRoute(code, id),
					map: null,
				};
			},
		},
	};
}

export async function transformMdxRoute(source: string, id: string) {
	const html = markdownToHtml(source, id);
	return [
		'const arcadeMdxPage = {',
		'  renderSsr() {',
		`    return { html: ${JSON.stringify(html)} };`,
		'  }',
		'};',
		'export default arcadeMdxPage;',
		'',
	].join('\n');
}

function isMdxFile(id: string) {
	return extname(decodePath(parseURL(id).pathname)) === '.mdx';
}

function markdownToHtml(source: string, id: string): string {
	if (source.includes('--- content') || /<\w/.test(source) || /^import\s/m.test(source)) {
		throw new Error(`Arcade Router MDX support is limited to static markdown today: ${id}`);
	}

	const blocks = source
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter(Boolean);

	return blocks.map(markdownBlockToHtml).join('');
}

function markdownBlockToHtml(block: string): string {
	const heading = block.match(/^(#{1,6})\s+(.+)$/);
	if (heading) {
		const level = heading[1]!.length;
		return `<h${level}>${escapeHtml(heading[2]!)}</h${level}>`;
	}

	return `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
