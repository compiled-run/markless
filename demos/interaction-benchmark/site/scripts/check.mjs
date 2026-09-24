#!/usr/bin/env node
// Static checks on site/dist: document basics, balanced tags, unique ids, ARIA id references, and every internal link/fragment resolves.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist'));
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const errors = [];
const err = (file, msg) => errors.push(`${path.relative(dist, file)}: ${msg}`);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
if (!fs.existsSync(dist)) {
	console.error(`no dist at ${dist}`);
	process.exit(1);
}
const files = walk(dist);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const idsByFile = new Map();
const attr = (tag, name) => [...tag.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1]);
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const parsed = htmlFiles.map((file) => {
	const html = fs.readFileSync(file, 'utf8');
	const stripped = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '<$1></$1>');
	const tags = [...stripped.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g)];
	return { file, html, stripped, tags };
});

for (const { file, html, stripped, tags } of parsed) {
	if (!/^<!doctype html>/i.test(html)) err(file, 'missing <!doctype html>');
	if (!/<html lang="[a-z-]+">/.test(html)) err(file, 'missing <html lang>');
	if (!/<meta charset="utf-8">/.test(html)) err(file, 'missing charset');
	if ((html.match(/<title>[^<]+<\/title>/g) ?? []).length !== 1) err(file, 'expected exactly one non-empty <title>');
	if ((stripped.match(/<h1[\s>]/g) ?? []).length !== 1) err(file, 'expected exactly one <h1>');
	if (!/<main[\s>]/.test(stripped)) err(file, 'missing <main>');
	const stack = [];
	for (const m of tags) {
		const name = m[1].toLowerCase();
		const closing = m[0].startsWith('</');
		if (VOID.has(name) || m[2] === '/') continue;
		if (!closing) stack.push(name);
		else if (stack.at(-1) === name) stack.pop();
		else {
			err(file, `unbalanced </${name}> (open: ${stack.slice(-3).join(' > ')})`);
			break;
		}
	}
	if (stack.length && stack.join() !== '') err(file, `unclosed tags: ${stack.join(' > ')}`);
	const ids = new Set();
	for (const m of tags) {
		for (const id of attr(m[0], 'id')) {
			if (ids.has(id)) err(file, `duplicate id "${id}"`);
			ids.add(id);
		}
	}
	idsByFile.set(file, ids);
	for (const m of tags) {
		for (const a of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for'])
			for (const v of attr(m[0], a)) for (const ref of v.split(/\s+/).filter(Boolean)) if (!ids.has(ref)) err(file, `${a} references missing id "${ref}"`);
		if (/^<svg\b/.test(m[0]) && !/role="img"/.test(m[0])) err(file, 'svg without role="img"');
		if (/^<img\b/.test(m[0]) && !/\salt="/.test(m[0])) err(file, 'img without alt');
	}
}

let checkedLinks = 0;
for (const { file, tags } of parsed) {
	for (const m of tags) {
		for (const raw of [...attr(m[0], 'href'), ...attr(m[0], 'src')]) {
			const href = decode(raw);
			if (/^(https?:|mailto:|data:)/.test(href)) continue;
			checkedLinks++;
			const [p, frag] = href.split('#');
			const target = p ? path.resolve(path.dirname(file), p) : file;
			if (!target.startsWith(dist)) {
				err(file, `link escapes dist: ${href}`);
				continue;
			}
			if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
				err(file, `broken link: ${href}`);
				continue;
			}
			if (frag && target.endsWith('.html') && !idsByFile.get(target)?.has(decodeURIComponent(frag))) err(file, `missing fragment: ${href}`);
		}
	}
}

for (const f of files.filter((x) => x.endsWith('.jsonl'))) {
	const lines = fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim());
	lines.forEach((l, i) => {
		try {
			JSON.parse(l);
		} catch {
			err(f, `line ${i + 1} is not JSON`);
		}
	});
}

if (errors.length) {
	console.error(errors.slice(0, 50).join('\n'));
	console.error(`site check: ${errors.length} error(s) in ${htmlFiles.length} pages`);
	process.exit(1);
}
console.log(`site check: ${htmlFiles.length} pages, ${checkedLinks} internal links/assets resolved, 0 errors`);
