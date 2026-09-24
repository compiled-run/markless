// Minimal Markdown subset for the repo's own docs: headings, paragraphs, nested lists, tables, fenced code, inline code/bold/links.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function markdownSection(md, heading) {
	const lines = md.split('\n');
	const start = lines.findIndex((l) => l.trim() === heading);
	if (start < 0) throw new Error(`markdown section not found: ${heading}`);
	const level = heading.match(/^#+/)[0].length;
	const out = [];
	let fenced = false;
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith('```')) fenced = !fenced;
		const h = !fenced && line.match(/^(#+)\s/);
		if (h && h[1].length <= level) break;
		out.push(line);
	}
	return out.join('\n').trim();
}

function inline(text, opts) {
	return text
		.split(/(`[^`]+`)/)
		.map((part) => {
			if (part.startsWith('`') && part.endsWith('`') && part.length > 1) return `<code>${esc(part.slice(1, -1))}</code>`;
			return esc(part)
				.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
				.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
					const abs = /^(https?:|mailto:|#)/.test(href) ? href : opts.linkBase ? opts.linkBase + href : null;
					return abs ? `<a href="${abs}">${label}</a>` : label;
				});
		})
		.join('');
}

function splitRow(line) {
	const cells = [];
	let cur = '';
	let code = false;
	const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (ch === '`') code = !code;
		if (ch === '\\' && body[i + 1] === '|') {
			cur += '|';
			i++;
			continue;
		}
		if (ch === '|' && !code) {
			cells.push(cur.trim());
			cur = '';
		} else cur += ch;
	}
	cells.push(cur.trim());
	return cells;
}

export function renderMarkdown(md, opts = {}) {
	const offset = opts.headingOffset ?? 0;
	const lines = md.split('\n');
	const out = [];
	let i = 0;
	const listItem = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
	while (i < lines.length) {
		const line = lines[i];
		if (!line.trim()) {
			i++;
			continue;
		}
		if (line.startsWith('```')) {
			const code = [];
			i++;
			while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
			i++;
			out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
			continue;
		}
		const h = line.match(/^(#+)\s+(.*)$/);
		if (h) {
			const level = Math.min(6, h[1].length + offset);
			out.push(`<h${level}>${inline(h[2], opts)}</h${level}>`);
			i++;
			continue;
		}
		if (line.trim().startsWith('|') && lines[i + 1]?.trim().match(/^\|?\s*:?-{3,}/)) {
			const head = splitRow(line);
			i += 2;
			const rows = [];
			while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]));
			out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th scope="col">${inline(c, opts)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, opts)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
			continue;
		}
		if (listItem.test(line)) {
			const items = [];
			while (i < lines.length && (listItem.test(lines[i]) || (lines[i].trim() && /^\s+/.test(lines[i])))) {
				const m = lines[i].match(listItem);
				if (m) items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] });
				else items[items.length - 1].text += ` ${lines[i].trim()}`;
				i++;
			}
			out.push(renderList(items, 0, opts).html);
			continue;
		}
		const para = [];
		while (i < lines.length && lines[i].trim() && !lines[i].startsWith('```') && !/^#+\s/.test(lines[i]) && !listItem.test(lines[i]) && !lines[i].trim().startsWith('|')) para.push(lines[i++].trim());
		out.push(`<p>${inline(para.join(' '), opts)}</p>`);
	}
	return out.join('\n');
}

function renderList(items, start, opts) {
	const indent = items[start].indent;
	const tag = items[start].ordered ? 'ol' : 'ul';
	let html = `<${tag}>`;
	let i = start;
	while (i < items.length && items[i].indent >= indent) {
		if (items[i].indent > indent) {
			const nested = renderList(items, i, opts);
			html = html.replace(/<\/li>$/, `${nested.html}</li>`);
			i = nested.next;
			continue;
		}
		html += `<li>${inline(items[i].text, opts)}</li>`;
		i++;
	}
	return { html: `${html}</${tag}>`, next: i };
}
