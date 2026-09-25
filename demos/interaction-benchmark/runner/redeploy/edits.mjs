// The redeploy edit matrix, expressed once per entrant. apply() returns a restore function.
import {
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { apps, appsDir, badgeSource, repoRoot } from './apps.mjs';
import { runtimeEdits } from './runtime-edits.mjs';

export const EDITS = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'];

export const editDescriptions = {
	e1: 'one-line text change in the /records page component ("Search records" -> "Search all records")',
	e2: 'shared app helper module used by every route: documentTitle() separator and one SIDEBAR_TREE label',
	e3: 'new stateful component (toggle badge) added to /settings',
	e4: 'one style rule of one component (.sort-button) in the app stylesheet',
	e5: 'framework patch release: one string literal changed in the shipped client runtime',
	e6: 'route-only change on /settings (field label text)',
};

function patchFile(file, transform) {
	const before = readFileSync(file, 'utf8');
	const after = transform(before);
	if (after === before) throw new Error(`edit is a no-op: ${file}`);
	// unlink first: node_modules files are hard links into the pnpm store and must not be written through.
	unlinkSync(file);
	writeFileSync(file, after);
	return () => {
		unlinkSync(file);
		writeFileSync(file, before);
	};
}

function replaceOnce(pattern, replacement) {
	return (text) => {
		const count = text.split(pattern).length - 1;
		if (typeof pattern === 'string' && count !== 1)
			throw new Error(`expected exactly one "${pattern}", found ${count}`);
		return text.replace(pattern, replacement);
	};
}

export function applyEdit(name, edit) {
	const app = apps[name];
	const dir = join(appsDir, name);
	const restores = [];
	const patch = (file, transform) => restores.push(patchFile(file, transform));
	switch (edit) {
		case 'e1':
			patch(join(dir, app.records), replaceOnce('Search records', 'Search all records'));
			break;
		case 'e2':
			patch(join(dir, app.shared, 'data.ts'), (text) =>
				replaceOnce(
					'`${route.title} | ${SITE_TITLE}`',
					'`${route.title} - ${SITE_TITLE}`',
				)(replaceOnce("label: 'Streaming' }", "label: 'Streaming SSR' }")(text)),
			);
			break;
		case 'e3': {
			const file = join(dir, app.badge.file);
			if (existsSync(file)) throw new Error(`badge already exists: ${file}`);
			writeFileSync(file, badgeSource[name]);
			restores.push(() => rmSync(file));
			patch(join(dir, app.settings), (text) => {
				const withTag = replaceOnce('</form>', '<T180Badge /></form>')(text);
				if (name === 'sveltekit')
					return replaceOnce(
						'<script lang="ts">',
						`<script lang="ts">\n\t${app.badge.import}`,
					)(withTag);
				return `${app.badge.import}\n${withTag}`;
			});
			break;
		}
		case 'e4':
			patch(
				join(dir, app.shared, 'styles.css'),
				replaceOnce(
					'.sort-button {\n\tpadding: 0;',
					'.sort-button {\n\tpadding: 0 0.125rem;',
				),
			);
			break;
		case 'e5': {
			const spec = runtimeEdits[name];
			if (!spec) throw new Error(`no runtime edit for ${name}`);
			const root = spec.workspace ? join(repoRoot, spec.dir) : join(dir, spec.dir);
			const files = [];
			(function walk(d) {
				for (const e of readdirSync(d)) {
					const p = join(d, e);
					if (statSync(p).isDirectory()) walk(p);
					else if (!p.endsWith('.map') && readFileSync(p, 'utf8').includes(spec.from))
						files.push(p);
				}
			})(root);
			if (files.length === 0) throw new Error(`runtime string not found under ${root}`);
			for (const file of files) patch(file, (text) => text.split(spec.from).join(spec.to));
			break;
		}
		case 'e6':
			patch(join(dir, app.settings), (text) => {
				const out = text.replace(/Display name(?=['"<])/g, 'Your display name');
				if ((out.match(/Your display name/g) ?? []).length !== 1)
					throw new Error('expected one Display name label');
				return out;
			});
			break;
		default:
			throw new Error(`unknown edit ${edit}`);
	}
	return () => {
		for (const restore of restores.reverse()) restore();
	};
}
