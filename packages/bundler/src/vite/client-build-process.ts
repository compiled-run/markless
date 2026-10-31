// Child process entry: builds one app's client environment, then writes what the later environments read.
import { readFileSync } from 'node:fs';
import type { Plugin, ViteBuilder } from 'vite';
import {
	CLIENT_CONFIG_MISMATCH_EXIT,
	configFingerprint,
	MARKLESS_VITE_PLUGIN_NAME,
	parseInlineConfig,
	type ClientBuildRequest,
} from './separate-client-build.ts';

type ClientBuildPlugin = Plugin & {
	api: { buildClientOnly(builder: ViteBuilder, handoffFile: string): Promise<void> };
};

const request = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as ClientBuildRequest;
try {
	const { createBuilder } = (await import(request.vite)) as typeof import('vite');
	const builder = await createBuilder(parseInlineConfig(request.inlineConfig), null);
	if (configFingerprint(builder.config) !== request.configFingerprint)
		process.exit(CLIENT_CONFIG_MISMATCH_EXIT);
	const plugin = builder.config.plugins.find(
		(candidate) => candidate.name === MARKLESS_VITE_PLUGIN_NAME,
	) as ClientBuildPlugin | undefined;
	if (!plugin)
		throw new Error(`${MARKLESS_VITE_PLUGIN_NAME} is missing from the reloaded config.`);
	await plugin.api.buildClientOnly(builder, request.handoffFile);
	process.exit(0);
} catch (error) {
	console.error(error);
	process.exit(1);
}
