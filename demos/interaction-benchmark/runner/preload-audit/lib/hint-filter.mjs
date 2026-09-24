// Upstream shim that removes preload hints from served HTML (and Link headers) unless their path is allowed.
// Used to approximate "perfect prediction": the page preloads only the closure of the control it will use.
import http from 'node:http';

const HINT = /<link\b[^>]*\brel\s*=\s*["']?(?:modulepreload|preload|prefetch)["']?[^>]*>/gi;
const hrefOf = (tag) => tag.match(/\bhref\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? null;

/** allow(pathname) -> keep the hint. Returns { url, setAllow(fn|null), stats, close }. null allow keeps every hint. */
export async function startHintFilter({ upstream, port, host = '127.0.0.1' }) {
	const base = new URL(upstream);
	let allow = null;
	const stats = { documents: 0, kept: 0, removed: 0, removedPaths: [] };
	const keep = (href, docUrl) => {
		if (!allow || !href) return true;
		return allow(new URL(href, docUrl).pathname);
	};
	const server = http.createServer((req, res) => {
		const headers = { ...req.headers, host: base.host };
		delete headers['accept-encoding'];
		const up = http.request({ host: base.hostname, port: base.port, method: req.method, path: req.url, headers }, (upRes) => {
			const type = String(upRes.headers['content-type'] ?? '');
			const out = { ...upRes.headers };
			if (allow && out.link) {
				out.link = String(out.link)
					.split(/,(?=\s*<)/)
					.filter((part) => !/rel\s*=\s*"?(modulepreload|preload|prefetch)/i.test(part) || keep(part.match(/<([^>]+)>/)?.[1], `http://x${req.url}`))
					.join(',');
				if (!out.link) delete out.link;
			}
			if (!type.includes('text/html') || !allow) {
				res.writeHead(upRes.statusCode, out);
				upRes.pipe(res);
				return;
			}
			const chunks = [];
			upRes.on('data', (c) => chunks.push(c));
			upRes.on('end', () => {
				stats.documents++;
				const html = Buffer.concat(chunks)
					.toString('utf8')
					.replace(HINT, (tag) => {
						const href = hrefOf(tag);
						if (keep(href, `http://x${req.url}`)) {
							stats.kept++;
							return tag;
						}
						stats.removed++;
						if (stats.removedPaths.length < 200) stats.removedPaths.push(href);
						return '';
					});
				delete out['content-length'];
				delete out['transfer-encoding'];
				res.writeHead(upRes.statusCode, { ...out, 'content-length': Buffer.byteLength(html) });
				res.end(html);
			});
		});
		up.on('error', (e) => {
			res.writeHead(502);
			res.end(String(e.message));
		});
		req.pipe(up);
	});
	await new Promise((resolve, reject) => server.once('error', reject).listen(port, host, resolve));
	return {
		url: `http://${host}:${server.address().port}`,
		stats,
		setAllow(fn) {
			allow = fn;
		},
		close: () => new Promise((r) => server.close(() => r())),
	};
}
