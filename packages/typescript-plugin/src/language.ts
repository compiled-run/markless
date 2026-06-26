import {
	compileTsrxForTypeService,
	type TsrxCodeMapping,
} from '@arcade/compiler/type-service';

type FileNameOrUri = string | { readonly fsPath: string };
type ScriptSnapshot = {
	getText(start: number, end: number): string;
	getLength(): number;
	getChangeRange(): unknown;
};
type VirtualCodeSnapshot = {
	getText(start: number, end: number): string;
	getLength(): number;
	getChangeRange(): undefined;
};

export const ARCADE_TSRX_LANGUAGE_ID = 'arcade-tsrx';
export const ARCADE_TSRX_EXTENSIONS = ['.tsrx'];

const SCRIPT_KIND_TS = 3;
const SCRIPT_KIND_DEFERRED = 7;

export function isArcadeTsrxFile(fileName: FileNameOrUri): boolean {
	return ARCADE_TSRX_EXTENSIONS.some((extension) =>
		normalizeFileName(fileName).endsWith(extension),
	);
}

export function getArcadeTsrxLanguagePlugin(): any {
	return {
		getLanguageId(fileNameOrUri: FileNameOrUri) {
			if (isArcadeTsrxFile(fileNameOrUri)) return ARCADE_TSRX_LANGUAGE_ID;
		},
		createVirtualCode(fileNameOrUri: FileNameOrUri, languageId: unknown, snapshot: ScriptSnapshot) {
			if (!shouldCreateArcadeTsrxVirtualCode(fileNameOrUri, languageId)) return undefined;
			return new ArcadeTsrxVirtualCode(normalizeFileName(fileNameOrUri), snapshot);
		},
		updateVirtualCode(
			_fileNameOrUri: FileNameOrUri,
			virtualCode: unknown,
			snapshot: ScriptSnapshot,
		) {
			if (!(virtualCode instanceof ArcadeTsrxVirtualCode)) return undefined;
			virtualCode.update(snapshot);
			return virtualCode;
		},
		typescript: {
			extraFileExtensions: ARCADE_TSRX_EXTENSIONS.map((extension) => ({
				extension: extension.slice(1),
				isMixedContent: false,
				scriptKind: SCRIPT_KIND_DEFERRED,
			})),
			getServiceScript(virtualCode) {
				if (virtualCode.languageId !== ARCADE_TSRX_LANGUAGE_ID) return undefined;
				return {
					code: virtualCode,
					extension: '.ts',
					scriptKind: SCRIPT_KIND_TS,
				};
			},
		},
	};
}

export class ArcadeTsrxVirtualCode {
	id = 'root';
	languageId = ARCADE_TSRX_LANGUAGE_ID;
	embeddedCodes: ArcadeTsrxCssVirtualCode[] = [];
	codegenStacks: unknown[] = [];
	generatedCode = '';
	mappings: TsrxCodeMapping[] = [];
	fileName: string;
	sourceSnapshot: ScriptSnapshot;
	sourceAst: unknown;
	usageErrors: unknown[] = [];
	snapshot: VirtualCodeSnapshot;

	constructor(fileName: string, snapshot: ScriptSnapshot) {
		this.fileName = fileName;
		this.sourceSnapshot = snapshot;
		this.sourceAst = undefined;
		this.snapshot = {
			getText: () => '',
			getLength: () => 0,
			getChangeRange: () => undefined,
		};
		this.update(snapshot);
	}

	update(snapshot: ScriptSnapshot): void {
		const source = snapshot.getText(0, snapshot.getLength());
		const compiled = compileTsrxForTypeService(source, this.fileName, { loose: true });
		this.sourceSnapshot = snapshot;
		this.generatedCode = compiled.code;
		this.sourceAst = compiled.sourceAst;
		this.usageErrors = compiled.errors;
		this.embeddedCodes = compiled.cssMappings.map(
			(mapping, index) => new ArcadeTsrxCssVirtualCode(this.fileName, mapping, index),
		);
		this.snapshot = {
			getText: (start, end) => this.generatedCode.substring(start, end),
			getLength: () => this.generatedCode.length,
			getChangeRange: () => undefined,
		};
		this.mappings = compiled.mappings;
	}
}

class ArcadeTsrxCssVirtualCode {
	languageId = 'css';
	embeddedCodes: [] = [];
	codegenStacks: unknown[] = [];
	id: string;
	fileName: string;
	snapshot: VirtualCodeSnapshot;
	mappings: TsrxCodeMapping[];

	constructor(fileName: string, mapping: TsrxCodeMapping, index: number) {
		const content = mapping.data?.customData?.content ?? '';
		this.id = `style_${index}`;
		this.fileName = `${fileName}.${this.id}.css`;
		this.snapshot = {
			getText: (start, end) => content.substring(start, end),
			getLength: () => content.length,
			getChangeRange: () => undefined,
		};
		this.mappings = [
			{
				...mapping,
				generatedOffsets: [0],
				generatedLengths: [content.length],
			},
		];
	}
}

export function transformTsrxForTypeScriptService(source) {
	return compileTsrxForTypeService(source, 'module.tsrx', { loose: true }).code;
}

function normalizeFileName(fileNameOrUri: FileNameOrUri): string {
	return typeof fileNameOrUri === 'string'
		? fileNameOrUri
		: fileNameOrUri.fsPath.replace(/\\/g, '/');
}

function shouldCreateArcadeTsrxVirtualCode(
	fileNameOrUri: FileNameOrUri,
	languageId: unknown,
): boolean {
	return isArcadeTsrxFile(fileNameOrUri) && isArcadeTsrxLanguageId(languageId);
}

function isArcadeTsrxLanguageId(languageId: unknown): boolean {
	if (languageId === ARCADE_TSRX_LANGUAGE_ID) return true;
	if (typeof languageId !== 'string') return false;
	const normalizedLanguageId = languageId.toLowerCase();
	return (
		normalizedLanguageId === 'tsrx' ||
		normalizedLanguageId === 'tsx' ||
		normalizedLanguageId === 'typescriptreact'
	);
}
