import { createRequire } from 'node:module';
import { startProxy } from '../proxy.mjs';
import { needsShapedListener } from './profiles.mjs';
import { startTarget } from './serve.mjs';

const require = createRequire(import.meta.url);
const playwrightTest = require('@playwright/test');
export const playwrightVersion = require('@playwright/test/package.json').version;
export const browserTypes = { chromium: playwrightTest.chromium, webkit: playwrightTest.webkit };

const metaContent = (html, name) => {
	for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
		if (new RegExp(`\\bname\\s*=\\s*["']${name}["']`, 'i').test(tag)) return tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? null;
	}
	return null;
};

/** Reads benchmark:entrant / benchmark:build from the served HTML (CONTRACT.md rule 8). */
export async function detectBuild(url) {
	const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'cache-control': 'no-cache' } });
	const html = await res.text();
	return { status: res.status, entrant: metaContent(html, 'benchmark:entrant'), build: metaContent(html, 'benchmark:build') };
}

/**
 * Starts servers and proxies for every target; setup errors mark the target not ready instead of aborting.
 * Each proxied target also gets one shaped listener per network-shaped profile (ports from
 * shapedProxyPorts[name] upward, else OS-assigned), exposed as target.shapedUrls[profileName].
 */
export async function prepareTargets(targets, log = console.error, { profiles = [], shapedProxyPorts = {} } = {}) {
	const shapedProfiles = profiles.filter(needsShapedListener);
	const cleanups = [];
	for (const t of targets) {
		try {
			if (t.serve) cleanups.push((await startTarget(t, { log })).stop);
			if (t.transport === 'proxy') {
				const base = shapedProxyPorts[t.name];
				const shaped = shapedProfiles.map((p, i) => ({ name: p.name, port: base === undefined ? 0 : base + i, network: p.network }));
				const proxy = await startProxy({ upstream: t.upstream, port: t.proxyPort, shaped });
				cleanups.push(proxy.close);
				t.url = proxy.url;
				t.proxyProtocol = proxy.protocol;
				t.proxyCompression = proxy.compression;
				t.proxyStats = proxy.stats;
				t.shapedUrls = proxy.shapedUrls;
				t.proxyShaping = proxy.shaping;
				log(`${t.name}: proxy ${proxy.url} -> ${t.upstream} (${proxy.protocol})${shaped.length ? `; shaped: ${Object.entries(proxy.shapedUrls).map(([n, u]) => `${n} ${u}`).join(', ')}` : ''}`);
			}
			const detected = await detectBuild(t.upstream ?? t.url);
			t.buildId = detected.build;
			t.detectedEntrant = detected.entrant;
			if (!detected.build) log(`${t.name}: WARNING no <meta name="benchmark:build"> in served HTML; every visit will be a build-mismatch failure`);
			t.ready = true;
		} catch (error) {
			t.ready = false;
			t.setupError = String(error.message ?? error);
			log(`${t.name}: NOT READY: ${t.setupError}`);
		}
	}
	return async () => {
		for (const c of cleanups.reverse()) await c().catch(() => {});
	};
}

export async function launch(name, { headed = false, chromiumChannel } = {}) {
	const type = browserTypes[name];
	if (!type) throw new Error(`unknown browser ${name} (chromium, webkit)`);
	return type.launch({ headless: !headed, ...(name === 'chromium' && chromiumChannel ? { channel: chromiumChannel } : {}) });
}
