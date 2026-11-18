import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { box } from '@async/witness';

// Every prerendered page and fragment URL: at most one <html>, and no scope class on head metadata.
const HTML_START = /<html[\s>]/gi;
const SCOPED_METADATA = /<(?:head|meta|title|link|script|base)(?=[\s>])[^>]*\bmk-[a-z0-9]+/gi;

export default box(
	{
		name: 'website documents: one <html> root, head metadata carries no scope class',
		tags: ['website', 'build'],
		modes: ['build'],
	},
	async ({ pipeline, receipt }) => {
		const preset = process.env.NITRO_PRESET;
		process.env.NITRO_PRESET = 'cloudflare-module';
		let root = '';
		try {
			await pipeline.build({
				config: (config) => {
					root = config.root ?? process.cwd();
					return config;
				},
			});
		} finally {
			if (preset === undefined) delete process.env.NITRO_PRESET;
			else process.env.NITRO_PRESET = preset;
		}
		const out = join(root, '.output/public');
		const pages = (readdirSync(out, { recursive: true }) as string[]).filter((file) =>
			file.endsWith('.html'),
		);
		if (!pages.includes('index.html')) throw new Error('The build prerendered no home page.');
		const failures = pages.flatMap((file) => {
			const html = readFileSync(join(out, file), 'utf8');
			const roots = html.match(HTML_START)?.length ?? 0;
			const scoped = html.match(SCOPED_METADATA) ?? [];
			return [
				...(roots > 1 ? [`${file}: ${roots} <html> start tags`] : []),
				...scoped.map((tag) => `${file}: ${tag}`),
			];
		});
		if (failures.length) throw new Error(failures.join('\n'));
		await receipt.capture(
			`${pages.length} prerendered documents, each with at most one <html> and an unscoped head`,
		);
	},
);
