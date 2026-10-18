/** Marks the page's link bridge script: inline in dev, a module stub importing the shared bridge in a build. */
export const LINK_BRIDGE_SCRIPT_ATTRIBUTE = 'data-markless-router-link-resumer';

/** The client output folder a build writes its link bridge files into, served as immutable static assets. */
export const LINK_BRIDGE_DIR = '_markless';

/** A built app's link bridge is a static client file under this pathname, immutable and preloaded. */
export const LINK_BRIDGE_MODULE_PATH = /\/_markless\/links\.[0-9a-z]+\.js$/;

export function linkBridgeModulePath(base: string, hash: string): string {
	return `${base.replace(/\/?$/, '/')}${LINK_BRIDGE_DIR}/links.${hash}.js`;
}

export function isLinkBridgeModulePath(pathname: string): boolean {
	return LINK_BRIDGE_MODULE_PATH.test(pathname);
}

/** True when `html` holds no module script other than the link bridge stub, and every stub imports only the bridge. */
export function moduleScriptsAreOnlyLinkBridge(html: string): boolean {
	for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
		if (!/\btype\s*=\s*["']?module\b/i.test(attributes!)) continue;
		if (!attributes!.includes(LINK_BRIDGE_SCRIPT_ATTRIBUTE) || /\bsrc\s*=/i.test(attributes!))
			return false;
		const imports = [...body!.matchAll(/\bimport\b\s*[\w$]*\s*from\s*["']([^"']+)["']/g)];
		if (imports.length !== 1 || !isLinkBridgeModulePath(imports[0]![1]!)) return false;
		if (/\bimport\s*\(/.test(body!)) return false;
	}
	return true;
}
