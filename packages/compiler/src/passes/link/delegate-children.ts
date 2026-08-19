// Pass `delegate-children`: decides which of a module's artifact-child edges
// are delegates a linker may render at build time, and turns the renderings the
// linker handed back into materializations. The classification is a typed kind
// over the linked child, never a path test: a delegate is a module this build
// did not compile, which is why the app-root gate this replaces is gone. The
// pass has no `resolve`, no `import()` and no filesystem, so a dependency's
// compiled JavaScript is an input artifact here and never something it loads.
import type {
	ArtifactChildMaterialization,
	CompilerDiagnostic,
	DelegateChildRenderPlan,
	DelegateChildRenderingResult,
	DelegateChildrenInput,
	DelegateImportFailure,
	DelegateRenderings,
	LinkedArtifactChild,
	LinkedDelegateChild,
	LinkedDelegateChildrenArtifact,
	LinkedModuleChildKind,
} from '../../artifacts.ts';

export const DELEGATE_CHILDREN_PASS_ID = 'delegate-children';

// A TSRX source is a compiler fact about a file, not a bundler fact about an id.
const TSRX_SOURCE_FILE = /\.tsrx(?:[?#].*)?$/;

// The candidates a linker still has to resolve. A TSRX specifier is already
// decided by kind, so asking the resolver about it would buy nothing.
export function delegateChildResolutionRequests(
	candidates: ReadonlyArray<LinkedArtifactChild>,
): ReadonlyArray<LinkedArtifactChild> {
	return candidates.filter((candidate) => !TSRX_SOURCE_FILE.test(candidate.importSource));
}

// The typed child table: one row per candidate, kind decided from what the
// specifier resolved to. `resolution` is keyed by edge id.
export function planDelegateChildren(
	candidates: ReadonlyArray<LinkedArtifactChild>,
	resolution: Readonly<Record<string, string>>,
): LinkedDelegateChild[] {
	return candidates.map((candidate) => {
		const source = resolution[candidate.edgeId];
		const kind = delegateChildKind(candidate.importSource, source);
		return {
			edgeId: candidate.edgeId,
			componentName: candidate.componentName,
			specifier: candidate.importSource,
			...(source === undefined ? {} : { source }),
			kind,
			loadable: kind === 'external-delegate',
		};
	});
}

// The whole classification, and the reason no path arithmetic survives here: a
// TSRX child is this build's own work and is composed as source, so it is never
// a delegate. Every other resolved child is a delegate candidate, and whether it
// materializes is settled by whether it handed back a rendering rather than by
// where its file happens to sit relative to the app root.
function delegateChildKind(
	specifier: string,
	source: string | undefined,
): LinkedModuleChildKind {
	if (TSRX_SOURCE_FILE.test(specifier)) return 'compiled-tsrx';
	if (source === undefined) return 'unresolved';
	return TSRX_SOURCE_FILE.test(source) ? 'compiled-tsrx' : 'external-delegate';
}

// The predicate the whole family exists for. Only a delegate that actually
// rendered is materializable; a child this build compiled never is, whatever
// the linker managed to load for it.
export function delegateChildMaterializable(
	child: LinkedDelegateChild,
	renderings: DelegateRenderings,
): boolean {
	return child.kind === 'external-delegate' && renderings[child.edgeId] !== undefined;
}

export function linkDelegateChildren(
	input: DelegateChildrenInput,
): LinkedDelegateChildrenArtifact {
	const materializations: Record<string, ArtifactChildMaterialization> = {};
	const diagnostics: CompilerDiagnostic[] = [];
	for (const child of input.children) {
		if (delegateChildMaterializable(child, input.renderings)) {
			materializations[child.edgeId] = input.renderings[child.edgeId]!;
		} else if (child.kind === 'external-delegate') {
			diagnostics.push(
				delegateArtifactMissingDiagnostic(
					child,
					input.importFailures?.find((failure) =>
						failure.edgeIds.includes(child.edgeId),
					),
				),
			);
		}
	}
	return {
		passId: DELEGATE_CHILDREN_PASS_ID,
		children: input.children,
		materializations,
		diagnostics,
	};
}

// Whether this module is composed in a position that materializes delegates at
// all. A client page root composes its own delegates; render data reached from
// a route root asks in its own right, on either side of the build.
export function delegateMaterializationScope(input: {
	readonly clientEnvironment: boolean;
	readonly symbolOnlyRequest: boolean;
	readonly moduleEntry: boolean;
	readonly renderDataReached: boolean;
}): boolean {
	return (
		(input.clientEnvironment && !input.symbolOnlyRequest && input.moduleEntry) ||
		input.renderDataReached
	);
}

// The props a delegate may be rendered with, or the reason it may not be.
// Runtime component execution is not a fallback, so a prop the compiler cannot
// read at build time is a refusal rather than a deferral.
export function delegateChildRenderPlan(candidate: LinkedArtifactChild): DelegateChildRenderPlan {
	const underivable = candidate.props.find((prop) => prop.kind !== 'serializable');
	if (underivable || (candidate.hasChildren && !candidate.projection)) {
		return {
			ok: false,
			diagnostic: delegatePropNotBuildKnownDiagnostic(
				candidate,
				underivable?.name ?? 'children',
			),
		};
	}
	const props = Object.fromEntries(
		candidate.props.map((prop) => [prop.name, prop.value]),
	) as Record<string, unknown>;
	return {
		ok: true,
		props: candidate.projection ? { ...props, children: candidate.projection.markup } : props,
	};
}

// The rendering a delegate's build-time output amounts to, or the reason the
// output is not static HTML. Shaping the output is compiler work; producing it
// is the linker's.
export function delegateChildRendering(
	candidate: LinkedArtifactChild,
	output: unknown,
): DelegateChildRenderingResult {
	if (
		!output ||
		typeof output !== 'object' ||
		typeof (output as { readonly html?: unknown }).html !== 'string'
	) {
		return { ok: false, diagnostic: delegateRenderInvalidDiagnostic(candidate) };
	}
	const result = output as Record<string, unknown>;
	return {
		ok: true,
		rendering: {
			html: result.html as string,
			elementCount: typeof result.elementCount === 'number' ? result.elementCount : 0,
			...(result.state ? { state: result.state as never } : {}),
			...(result.view ? { view: result.view as never } : {}),
			...(result.coordinates ? { coordinates: result.coordinates as never } : {}),
			...(result.structure ? { structure: result.structure as never } : {}),
			...(Array.isArray(result.structureTokens)
				? { structureTokens: result.structureTokens as never }
				: {}),
		},
	};
}

// Reported, not thrown: a dependency that exports no build-time renderer is an
// ordinary import, so the linker decides whether this is worth failing on.
function delegateArtifactMissingDiagnostic(
	child: LinkedDelegateChild,
	importFailure?: DelegateImportFailure,
): CompilerDiagnostic {
	// A failed import is the specific reason this edge handed back nothing.
	const cause = importFailure
		? ` Importing ${JSON.stringify(importFailure.source)} failed: ${importFailure.message}`
		: '';
	return {
		code: 'MARKLESS_DELEGATE_ARTIFACT_MISSING',
		severity: 'info',
		phase: 'public-render',
		title: 'Delegate child produced no build-time rendering',
		message: `MARKLESS_DELEGATE_ARTIFACT_MISSING: <${child.componentName}> resolves to ${JSON.stringify(child.source ?? child.specifier)}, which this build did not compile and which handed back no build-time rendering, so the edge stays a runtime import.${cause}`,
		why: 'A delegate is materialized from the rendering its own compiled module produced; without one there is nothing to inline.',
		passId: DELEGATE_CHILDREN_PASS_ID,
		artifactKeys: ['delegateChildren'],
		...(child.source ? { source: child.source } : {}),
		suggestions: [
			{
				message:
					'Publish the dependency with a build-time renderSsr export if its markup should be inlined at build time.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_DELEGATE_ARTIFACT_MISSING',
	};
}

function delegatePropNotBuildKnownDiagnostic(
	candidate: LinkedArtifactChild,
	prop: string,
): CompilerDiagnostic {
	return {
		code: 'MARKLESS_ARTIFACT_CHILD_PROP_NOT_BUILD_KNOWN',
		severity: 'error',
		phase: 'public-render',
		title: 'Delegate child prop is not build-known',
		message: `MARKLESS_ARTIFACT_CHILD_PROP_NOT_BUILD_KNOWN: <${candidate.componentName}> prop ${JSON.stringify(prop)} must be a build-known static value. Runtime component execution is not a fallback.`,
		why: 'A delegate is rendered once at build time, so every prop it reads must be a value the compiler can read at build time.',
		passId: DELEGATE_CHILDREN_PASS_ID,
		artifactKeys: ['delegateChildren'],
		suggestions: [{ message: 'Pass a static value, or compose the child as TSRX source.' }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ARTIFACT_CHILD_PROP_NOT_BUILD_KNOWN',
	};
}

function delegateRenderInvalidDiagnostic(candidate: LinkedArtifactChild): CompilerDiagnostic {
	return {
		code: 'MARKLESS_ARTIFACT_CHILD_RENDER_INVALID',
		severity: 'error',
		phase: 'public-render',
		title: 'Delegate child renderSsr returned no static HTML',
		message: `MARKLESS_ARTIFACT_CHILD_RENDER_INVALID: <${candidate.componentName}> renderSsr must return static HTML.`,
		why: 'The materialized edge is the delegate rendered output, so an output without HTML leaves nothing to inline.',
		passId: DELEGATE_CHILDREN_PASS_ID,
		artifactKeys: ['delegateChildren'],
		suggestions: [
			{ message: 'Return an object with a string `html` field from renderSsr.' },
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ARTIFACT_CHILD_RENDER_INVALID',
	};
}
