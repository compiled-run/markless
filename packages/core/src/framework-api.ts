export type AsyncComputedValue<T> = T extends Promise<infer Value> ? Awaited<Value> : T;

export type ElementHandle<T extends Element = Element> = T | undefined;

export type SharedScope = 'request' | 'container' | 'page' | 'widget';

export type SharedOptions = {
	readonly scope: SharedScope;
};

export type FrameworkApiName =
	| 'state'
	| 'computed'
	| 'element'
	| 'shared'
	| 'storage';

export type FrameworkApiRuntimeDiagnostic = {
	readonly code: 'MARKLESS_FRAMEWORK_API_RUNTIME_CALL';
	readonly severity: 'error';
	readonly phase: 'runtime';
	readonly title: 'Framework API executed without compiler output';
	readonly message: string;
	readonly why: string;
	readonly apiName: FrameworkApiName;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;
};

export class FrameworkApiRuntimeError extends Error implements FrameworkApiRuntimeDiagnostic {
	readonly code = 'MARKLESS_FRAMEWORK_API_RUNTIME_CALL' as const;
	readonly severity = 'error' as const;
	readonly phase = 'runtime' as const;
	readonly title = 'Framework API executed without compiler output' as const;
	readonly why: string;
	readonly apiName: FrameworkApiName;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl = 'https://markless.dev/errors/MARKLESS_FRAMEWORK_API_RUNTIME_CALL';

	constructor(apiName: FrameworkApiName) {
		super(frameworkApiRuntimeMessage(apiName));
		this.name = 'FrameworkApiRuntimeError';
		this.apiName = apiName;
		this.why = `${apiName}() is an markless framework API that must be rewritten by the .tsrx compiler before runtime execution.`;
		this.suggestions = [
			{
				message:
					'Import this API from markless inside a .tsrx file processed by the compiler. Do not call it from plain runtime JavaScript.',
			},
		];
	}
}

export function state<T>(initial: T): T {
	return frameworkApi<T>('state', initial);
}

export function computed<T>(derive: () => T): AsyncComputedValue<T> {
	return frameworkApi<AsyncComputedValue<T>>('computed', derive);
}

export function element<T extends Element = Element>(): ElementHandle<T> {
	return frameworkApi<ElementHandle<T>>('element');
}

export type SharedDefinition<T> = () => T;

export function shared<T>(create: () => T, options?: SharedOptions): SharedDefinition<T> {
	return frameworkApi<SharedDefinition<T>>('shared', create, options);
}

// Arity is the discriminator, matching the compiler's rule in
// packages/compiler/src/passes/semantic-graph/collect-storage.ts: two or more
// arguments means an explicit key, and otherwise the sole argument IS the
// fallback and the key is derived from the binding identifier. An optional
// second parameter would type a lone argument as a KEY — the exact inverse — so
// these must stay overloads.
export function storage(fallback: string): string;
export function storage(key: string, fallback: string): string;
export function storage(...args: [fallback: string] | [key: string, fallback: string]): string {
	return frameworkApi<string>('storage', ...args);
}

function frameworkApi<T>(name: string, ..._args: unknown[]): T {
	throw new FrameworkApiRuntimeError(name as FrameworkApiName);
}

function frameworkApiRuntimeMessage(name: FrameworkApiName): string {
	return `markless ${name}() must be compiled from a .tsrx file before it can run.`;
}
