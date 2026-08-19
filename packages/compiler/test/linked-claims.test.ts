import { describe, expect, test } from 'vitest';
import type { LinkedClaimIdNaming, LinkedClaimManifest } from '../src/artifacts.ts';
import {
	CLAIM_MANIFEST_PASS_ID,
	linkClaimManifests,
	linkedResolverClaimVerdict,
	linkedRouteArtifactRegistration,
	mergeLinkedSourceClaims,
	planEmittedClaimOwnership,
} from '../src/passes/link/claim-manifest.ts';

const source = '/workspace/app/components/WeatherPanel.tsrx';
const resolverId = `virtual:markless:resolver:${encodeURIComponent(source)}`;
const symbolsSource = `${source}?markless-symbols`;
const resumeSource = `${source}?markless-resume`;
const wakeSource = `${source}?markless-prerender-wake`;

const naming: LinkedClaimIdNaming = {
	sourcePathOf: (id) => id.split('?')[0] ?? id,
	isResumeRequest: (id) => id.endsWith('?markless-resume'),
	isWakeRequest: (id) => id.endsWith('?markless-prerender-wake'),
};

describe('claim-manifest link pass', () => {
	test('two emitted modules claiming one symbol incompatibly produce one diagnostic', () => {
		const artifact = linkClaimManifests({
			byEmittedModule: new Map([
				[source, manifest(source, [symbol('symbol:event')])],
				[
					symbolsSource,
					manifest(symbolsSource, [{ ...symbol('symbol:event'), exportName: 'conflict' }]),
				],
			]),
			sources: [{ source, resolverId }],
		});

		expect(artifact.passId).toBe(CLAIM_MANIFEST_PASS_ID);
		expect(artifact.diagnostics).toHaveLength(1);
		const [diagnostic] = artifact.diagnostics;
		expect(diagnostic?.code).toBe('MARKLESS_SOURCE_SYMBOL_CLAIMS_DIVERGED');
		expect(diagnostic?.passId).toBe('claim-manifest');
		expect(diagnostic?.artifactKeys).toEqual([source, symbolsSource]);
		expect(diagnostic?.message).toContain(JSON.stringify(source));
		expect(diagnostic?.message).toContain(JSON.stringify(symbolsSource));
	});

	test('compatible duplicate claims merge without a diagnostic', () => {
		const event = symbol('symbol:event');
		const settle = symbol('symbol:settle', 'async-boundary-update');
		const artifact = linkClaimManifests({
			byEmittedModule: new Map([
				[source, manifest(source, [event])],
				[symbolsSource, manifest(symbolsSource, [event, settle])],
			]),
			sources: [{ source, resolverId }],
		});

		expect(artifact.diagnostics).toEqual([]);
		expect(artifact.bySource[source]?.symbols).toEqual([event, settle]);
		expect(Object.keys(artifact.byEmittedModule)).toEqual([source, symbolsSource]);
	});

	test('a source with no claiming sibling merges to nothing rather than failing', () => {
		const merged = mergeLinkedSourceClaims({
			source,
			resolverId,
			claims: [manifest(source, [])],
		});

		expect(merged.manifest).toBeUndefined();
		expect(merged.diagnostics).toEqual([]);
	});

	test('route artifact registration for a source is deterministic', () => {
		const verdicts = [0, 1, 2].map(() =>
			linkedRouteArtifactRegistration({
				source,
				registered: false,
				primaryTransformed: false,
				dev: false,
			}),
		);
		expect(verdicts).toEqual([
			{ action: 'register', diagnostics: [] },
			{ action: 'register', diagnostics: [] },
			{ action: 'register', diagnostics: [] },
		]);

		expect(
			linkedRouteArtifactRegistration({
				source,
				registered: true,
				primaryTransformed: true,
				dev: false,
			}).action,
		).toBe('already-registered');
		expect(
			linkedRouteArtifactRegistration({
				source,
				registered: false,
				primaryTransformed: true,
				dev: true,
			}).action,
		).toBe('reinvalidate');

		const late = linkedRouteArtifactRegistration({
			source,
			registered: false,
			primaryTransformed: true,
			dev: false,
		});
		expect(late.action).toBe('late');
		expect(late.diagnostics[0]?.code).toBe('MARKLESS_ROUTE_ARTIFACT_REGISTERED_LATE');
		expect(late.diagnostics[0]?.passId).toBe('claim-manifest');
	});

	test('a wake variant with symbols hands its routes to the resolver and displaces siblings', () => {
		const ownership = planEmittedClaimOwnership({
			source,
			emittedModule: wakeSource,
			manifest: manifest(wakeSource, [symbol('symbol:event')]),
			resolverModuleId: resolverId,
			wakeOwnsRoutes: false,
			claimOwners: [source, resumeSource, symbolsSource],
			naming,
		});

		expect(ownership.owner).toBe(resolverId);
		expect(ownership.manifest.source).toBe(source);
		expect(ownership.manifest.resolver.virtualModuleId).toBe(resolverId);
		expect(ownership.displacedOwners).toEqual([source, resumeSource]);
		expect(ownership.diagnostics).toEqual([]);
	});

	test('an ordinary sibling cedes its symbols once a wake variant owns the routes', () => {
		const ownership = planEmittedClaimOwnership({
			source,
			emittedModule: resumeSource,
			manifest: manifest(resumeSource, [symbol('symbol:event')]),
			resolverModuleId: resolverId,
			wakeOwnsRoutes: true,
			claimOwners: [],
			naming,
		});

		expect(ownership.owner).toBe(resumeSource);
		expect(ownership.manifest.symbols).toEqual([]);
		expect(ownership.displacedOwners).toEqual([]);
	});

	test('a wake variant with no resolver to own its routes is a diagnostic, not a merge', () => {
		const ownership = planEmittedClaimOwnership({
			source,
			emittedModule: wakeSource,
			manifest: manifest(wakeSource, [symbol('symbol:event')]),
			resolverModuleId: undefined,
			wakeOwnsRoutes: false,
			claimOwners: [],
			naming,
		});

		expect(ownership.diagnostics[0]?.code).toBe('MARKLESS_PRERENDER_WAKE_RESOLVER_MISSING');
		expect(ownership.diagnostics[0]?.passId).toBe('claim-manifest');
	});

	test('resolver claim sets keep the superset and refuse two that contain neither', () => {
		expect(
			linkedResolverClaimVerdict({
				resolverId,
				current: ['a', 'b'],
				next: ['a'],
			}).action,
		).toBe('keep-current');
		expect(
			linkedResolverClaimVerdict({ resolverId, current: ['a'], next: ['a', 'b'] }).action,
		).toBe('replace');
		expect(
			linkedResolverClaimVerdict({ resolverId, current: ['a'], next: ['a'] }).action,
		).toBe('replace');

		const diverged = linkedResolverClaimVerdict({
			resolverId,
			current: ['a'],
			next: ['b'],
		});
		expect(diverged.action).toBe('diverged');
		expect(
			diverged.action === 'diverged' ? diverged.diagnostic.code : undefined,
		).toBe('MARKLESS_RESOLVER_CLAIMS_DIVERGED');
	});
});

function manifest(
	emittedSource: string,
	symbols: LinkedClaimManifest['symbols'],
): LinkedClaimManifest {
	return { source: emittedSource, resolver: { virtualModuleId: resolverId }, symbols };
}

function symbol(symbolId: string, kind = 'event-handler'): LinkedClaimManifest['symbols'][number] {
	return {
		symbolId,
		exportName: symbolId.replace(':', '_'),
		kind,
		virtualModuleId: `virtual:markless:symbol:${encodeURIComponent(source)}:${encodeURIComponent(symbolId)}`,
	};
}
