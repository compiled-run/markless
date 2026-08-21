import type { MarklessTsrxTypeServiceResult } from '@markless/compiler/type-service';
import type { CodeMapping, LanguagePlugin, VirtualCode } from '@volar/language-core';
// Side-effect type import: @volar/typescript augments LanguagePlugin with the `typescript`
// field the TS program reads, and without it that field is an unknown property.
import type {} from '@volar/typescript';
import type * as ts from 'typescript';
import { fileURLToPath } from 'node:url';
import {
	MARKLESS_TSRX_EXTENSIONS,
	MARKLESS_TSRX_LANGUAGE_ID,
	MARKLESS_TSRX_PARSE_ERROR_CODE,
	isMarklessTsrxFile,
} from './language.ts';
import { compileToVolarMappingsWithoutRecovery } from './volar.ts';

/**
 * The JSX contract that types Markless markup - intrinsic tags, their attributes, the
 * element handle. In an editor the plugin hands tsserver this file through
 * `getExternalFiles`; a command line has no such hook, so `markless-tsc` puts it in the
 * program itself and a project keeps its tsconfig free of a path into node_modules.
 */
export const MARKLESS_JSX_CONTRACT_FILE = fileURLToPath(
	new URL('./markless-jsx.d.ts', import.meta.url),
);

/**
 * Add the JSX contract to a program that contains `.tsrx`, in place. `rootNames` is the
 * array the TypeScript program is about to be built from, so a file pushed here is checked
 * with it.
 */
export function addMarklessJsxContract(rootNames: string[]): void {
	if (!rootNames.some((rootName) => isMarklessTsrxFile(rootName))) return;
	if (rootNames.includes(MARKLESS_JSX_CONTRACT_FILE)) return;
	rootNames.push(MARKLESS_JSX_CONTRACT_FILE);
}

/**
 * A `.tsrx` the compiler could not turn into TypeScript at all, or turned into TypeScript
 * only by reporting errors along the way. TypeScript never sees these - there is no
 * generated TSX to raise them on - so the checker reports them itself, and they are what
 * makes an unparsable file fail the gate instead of passing it silently.
 */
export type MarklessCompileError = {
	readonly fileName: string;
	readonly message: string;
	/** Offset into the authored `.tsrx` source. */
	readonly pos: number;
};

const compileErrors: MarklessCompileError[] = [];
const seenCompileErrors = new Set<string>();

export function marklessCompileErrors(): readonly MarklessCompileError[] {
	return compileErrors;
}

export function clearMarklessCompileErrors(): void {
	compileErrors.length = 0;
	seenCompileErrors.clear();
}

function recordCompileError(fileName: string, error: unknown): MarklessCompileError | undefined {
	const message = error instanceof Error ? error.message : String(error);
	const pos =
		typeof error === 'object' && error !== null && 'pos' in error && typeof error.pos === 'number'
			? error.pos
			: 0;
	// One program build can compile the same file more than once; report each distinct
	// failure once.
	const key = `${fileName}\0${pos}\0${message}`;
	if (seenCompileErrors.has(key)) return undefined;
	seenCompileErrors.add(key);
	const recorded = { fileName, message, pos };
	compileErrors.push(recorded);
	return recorded;
}

/** `path/to/file.tsrx(12,5): error TS91001: ...` - the shape tsc problem matchers parse. */
export function formatMarklessCompileError(
	error: MarklessCompileError,
	source: string,
	directory = '',
): string {
	const upToPos = source.slice(0, Math.max(0, Math.min(error.pos, source.length)));
	const line = upToPos.split('\n').length;
	const column = upToPos.length - (upToPos.lastIndexOf('\n') + 1) + 1;
	// tsc names a file relative to where it was run; a compile error reads the same way.
	const prefix = directory.endsWith('/') ? directory : `${directory}/`;
	const fileName =
		directory !== '' && error.fileName.startsWith(prefix)
			? error.fileName.slice(prefix.length)
			: error.fileName;
	return `${fileName}(${line},${column}): error TS${MARKLESS_TSRX_PARSE_ERROR_CODE}: Markless TSRX parse error: ${error.message}`;
}

type TsrxServiceScript = {
	readonly code: VirtualCode;
	readonly extension: '.tsx';
	readonly scriptKind: ts.ScriptKind;
};

class MarklessTypecheckVirtualCode implements VirtualCode {
	id = 'root';
	languageId = MARKLESS_TSRX_LANGUAGE_ID;
	embeddedCodes: VirtualCode[] = [];
	snapshot: ts.IScriptSnapshot;
	mappings: CodeMapping[] = [];

	constructor(source: string, fileName: string, onError: (error: unknown) => void) {
		let compiled: MarklessTsrxTypeServiceResult | undefined;
		try {
			compiled = compileToVolarMappingsWithoutRecovery(source, fileName, { loose: true });
		} catch (error) {
			onError(error);
		}
		for (const error of compiled?.errors ?? []) onError(error);
		const code = compiled?.code ?? '';
		this.mappings = (compiled?.mappings ?? []) as CodeMapping[];
		this.snapshot = {
			getText: (start, end) => code.substring(start, end),
			getLength: () => code.length,
			getChangeRange: () => undefined,
		};
	}
}

/**
 * The Volar language plugin `markless-tsc` hands to `@volar/typescript`, so the TypeScript
 * program sees each `.tsrx` as the TSX the type service generates for it. This is the CLI
 * half of the editor integration: both compile through src/volar.ts, and only the recovery
 * of a half-typed file differs (see compileToVolarMappingsWithoutRecovery).
 */
export function createMarklessTypecheckLanguagePlugin(
	typescript: typeof ts,
	reportCompileError: (error: MarklessCompileError, source: string) => void = () => {},
): LanguagePlugin<string> {
	return {
		getLanguageId(scriptId) {
			return isMarklessTsrxFile(scriptId) ? MARKLESS_TSRX_LANGUAGE_ID : undefined;
		},
		createVirtualCode(scriptId, languageId, snapshot) {
			if (languageId !== MARKLESS_TSRX_LANGUAGE_ID) return undefined;
			const source = snapshot.getText(0, snapshot.getLength());
			return new MarklessTypecheckVirtualCode(source, scriptId, (error) => {
				const recorded = recordCompileError(scriptId, error);
				if (recorded) reportCompileError(recorded, source);
			});
		},
		typescript: {
			extraFileExtensions: MARKLESS_TSRX_EXTENSIONS.map((extension) => ({
				extension: extension.slice(1),
				isMixedContent: false,
				scriptKind: typescript.ScriptKind.Deferred,
			})),
			getServiceScript(root): TsrxServiceScript | undefined {
				if (root.languageId !== MARKLESS_TSRX_LANGUAGE_ID) return undefined;
				return { code: root, extension: '.tsx', scriptKind: typescript.ScriptKind.TSX };
			},
		},
	};
}
