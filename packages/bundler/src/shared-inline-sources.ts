// One module holds the build's inline boot scripts: copied into every server module they cost ~22 kB per component.
import {
	compileInlineResumerSources,
	compilePrerenderInlineResumerSources,
} from './inline-resumer.ts';
import type { MarklessExecutionLogMode } from './types.ts';

export const SHARED_INLINE_RESUMER_SOURCES = 'inlineResumerSources';
export const SHARED_PRERENDER_BOOT = 'prerenderBoot';

const PREFIX = 'virtual:markless:inline-sources-';
const EXECUTION_LOG_MODES: ReadonlySet<string> = new Set<MarklessExecutionLogMode>([
	'auto',
	'never',
	'always',
]);

export function sharedInlineSourcesModuleId(options: {
	readonly debug: boolean;
	readonly executionLog: MarklessExecutionLogMode;
}): string {
	return `${PREFIX}${options.debug ? 'debug' : 'production'}-${options.executionLog}`;
}

function sharedInlineSourcesOptions(
	id: string,
): { readonly debug: boolean; readonly executionLog: MarklessExecutionLogMode } | null {
	const bare = id.startsWith('\0') ? id.slice(1) : id;
	if (!bare.startsWith(PREFIX)) return null;
	const [flavour, executionLog] = bare.slice(PREFIX.length).split('-');
	if ((flavour !== 'debug' && flavour !== 'production') || !EXECUTION_LOG_MODES.has(executionLog!))
		return null;
	return { debug: flavour === 'debug', executionLog: executionLog as MarklessExecutionLogMode };
}

export function isSharedInlineSourcesModuleId(id: string): boolean {
	return sharedInlineSourcesOptions(id) !== null;
}

export async function sharedInlineSourcesModuleSource(id: string): Promise<string | null> {
	const options = sharedInlineSourcesOptions(id);
	if (!options) return null;
	const [sources, prerender] = await Promise.all([
		compileInlineResumerSources(options),
		compilePrerenderInlineResumerSources(),
	]);
	return [
		`export const ${SHARED_INLINE_RESUMER_SOURCES} = ${JSON.stringify(sources)};`,
		`export const ${SHARED_PRERENDER_BOOT} = ${JSON.stringify(prerender)};`,
	].join('\n');
}
