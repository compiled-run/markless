import { describe, expect, it } from 'vitest';
import {
	isLinkBridgeModulePath,
	linkBridgeModulePath,
	moduleScriptsAreOnlyLinkBridge,
} from '../src/vite/runtime/link-bridge-module.ts';

const bridge = linkBridgeModulePath('/', 'a1b2c3');

describe('link bridge module checks', () => {
	it('names the bridge under the app base', () => {
		expect(linkBridgeModulePath('/docs', 'x9')).toBe('/docs/_markless/links/x9.js');
		expect(isLinkBridgeModulePath(bridge)).toBe(true);
		expect(isLinkBridgeModulePath('/build/links.a1b2c3.js')).toBe(false);
	});

	it('allows only the bridge stub as a module script', () => {
		const stub = `<script type="module" async data-markless-router-link-resumer>import b from"${bridge}";b(0,[],{})</script>`;
		expect(moduleScriptsAreOnlyLinkBridge(`<div>${stub}</div>`)).toBe(true);
		expect(
			moduleScriptsAreOnlyLinkBridge('<script data-async-resumer>(()=>{})()</script>'),
		).toBe(true);
		expect(
			moduleScriptsAreOnlyLinkBridge('<script type="module" src="/build/page.js"></script>'),
		).toBe(false);
		expect(
			moduleScriptsAreOnlyLinkBridge(
				`<script type="module" async data-markless-router-link-resumer>import b from"/build/page.js";b()</script>`,
			),
		).toBe(false);
		expect(
			moduleScriptsAreOnlyLinkBridge(
				`<script type="module" async data-markless-router-link-resumer>import b from"${bridge}";import("/build/page.js");b()</script>`,
			),
		).toBe(false);
	});
});
