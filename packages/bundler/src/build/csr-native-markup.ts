import type { MarklessTransformManifest } from '../types.ts';

export function injectCsrNativeMarkup(
	bundle: Record<string, unknown>,
	manifests: Iterable<MarklessTransformManifest>,
): void {
	const payloads = new Map<string, NonNullable<MarklessTransformManifest['csrNativeMarkup']>[number]>();
	for (const manifest of manifests)
		for (const payload of manifest.csrNativeMarkup ?? []) payloads.set(payload.dataId, payload);
	if (payloads.size === 0) return;

	const markup = [...payloads.values()].map(nativePayloadMarkup).join('');
	for (const output of Object.values(bundle)) {
		if (!isHtmlAsset(output)) continue;
		output.source = output.source.includes('</body>')
			? output.source.replace('</body>', `${markup}</body>`)
			: `${output.source}${markup}`;
	}
}

function nativePayloadMarkup(
	payload: NonNullable<MarklessTransformManifest['csrNativeMarkup']>[number],
): string {
	const templates = payload.templates
		.map(
			(template) =>
				`<template id="${escapeAttribute(template.id)}">${template.markup}</template>`,
		)
		.join('');
	const definition = JSON.stringify(payload.definition).replaceAll('<', '\\u003c');
	return `${templates}<script type="application/json" id="${escapeAttribute(payload.dataId)}">${definition}</script>`;
}

function escapeAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function isHtmlAsset(output: unknown): output is {
	readonly type: 'asset';
	readonly fileName: string;
	source: string;
} {
	if (!output || typeof output !== 'object') return false;
	const asset = output as { readonly type?: unknown; readonly fileName?: unknown; source?: unknown };
	return (
		asset.type === 'asset' &&
		typeof asset.fileName === 'string' &&
		asset.fileName.endsWith('.html') &&
		typeof asset.source === 'string'
	);
}
