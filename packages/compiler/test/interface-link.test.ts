import { expect, test } from 'vitest';
import type { LinkedInterfaceImport, ModuleGraphInterfaceArtifact } from '../src/artifacts.ts';
import { linkCompilerPasses } from '../src/pass-registry.ts';
import { computeLinkedInterfaces, moduleInterfaceHash } from '../src/passes/link/interface-link.ts';

const moduleInterface = (filename: string, exportName: string): ModuleGraphInterfaceArtifact => ({
	passId: 'module-graph-interface',
	filename,
	exports: [{ exportName, localName: exportName, kind: 'graph-binding', bindingKind: 'state' }],
	render: { version: 1, components: [] },
});

const imported = (
	specifier: string,
	source: string,
	artifact?: ModuleGraphInterfaceArtifact,
): LinkedInterfaceImport => ({
	specifier,
	source,
	...(artifact
		? { interfaceHash: moduleInterfaceHash(artifact), moduleInterface: artifact }
		: {}),
});

test('interface-link is registered as a link pass with its artifact boundary', () => {
	expect(linkCompilerPasses).toContainEqual({
		passId: 'interface-link',
		description: expect.stringContaining('linked interface map'),
		consumes: ['moduleArtifacts', 'linkedModuleGraph'],
		produces: ['linkedInterfaces'],
	});
});

test('the linked interface map is keyed by the specifier the importer wrote', () => {
	const widget = moduleInterface('/app/widget.tsrx', 'Widget');
	const artifact = computeLinkedInterfaces({
		imports: [
			imported('./widget.tsrx', '/app/widget.tsrx', widget),
			// No interface linked yet: the specifier stays out of the map, and the
			// signature still records that the import exists.
			imported('./pending.tsrx', '/app/pending.tsrx'),
		],
		claims: [],
	});
	expect(artifact.passId).toBe('interface-link');
	expect(artifact.interfaces).toEqual({ './widget.tsrx': widget });
	expect(artifact.signature).toContain(encodeURIComponent('/app/pending.tsrx'));
});

test('two different interface sets never produce the same signature', () => {
	const widget = moduleInterface('/app/widget.tsrx', 'Widget');
	const widgetChanged = moduleInterface('/app/widget.tsrx', 'WidgetRenamed');
	const signature = (imports: ReadonlyArray<LinkedInterfaceImport>) =>
		computeLinkedInterfaces({ imports, claims: [] }).signature;

	const sets = [
		[imported('./widget.tsrx', '/app/widget.tsrx', widget)],
		// Same specifier and source, changed interface.
		[imported('./widget.tsrx', '/app/widget.tsrx', widgetChanged)],
		// Same specifier, re-resolved to another source.
		[imported('./widget.tsrx', '/app/vendored/widget.tsrx', widget)],
		// Interface not linked at all.
		[imported('./widget.tsrx', '/app/widget.tsrx')],
		// One more import in the set.
		[
			imported('./widget.tsrx', '/app/widget.tsrx', widget),
			imported('./panel.tsrx', '/app/panel.tsrx', widget),
		],
		// The separators the signature is built from cannot be smuggled in
		// through a specifier or a source that contains them.
		[imported('a:b', 'c', widget)],
		[imported('a', 'b:c', widget)],
		[imported('a|b', 'c', widget)],
	];
	const signatures = sets.map(signature);
	expect(new Set(signatures).size).toBe(sets.length);
});

test('the signature does not depend on the order imports were resolved in', () => {
	const widget = moduleInterface('/app/widget.tsrx', 'Widget');
	const panel = moduleInterface('/app/panel.tsrx', 'Panel');
	const first = imported('./widget.tsrx', '/app/widget.tsrx', widget);
	const second = imported('./panel.tsrx', '/app/panel.tsrx', panel);
	expect(computeLinkedInterfaces({ imports: [first, second], claims: [] }).signature).toBe(
		computeLinkedInterfaces({ imports: [second, first], claims: [] }).signature,
	);
});

test('a render-data-only change keeps the signature and changes the claim signature', () => {
	const widget = moduleInterface('/app/widget.tsrx', 'Widget');
	const imports = [imported('./widget.tsrx', '/app/widget.tsrx', widget)];
	const before = computeLinkedInterfaces({
		imports,
		claims: [
			{
				source: '/app/widget.tsrx',
				symbols: [{ symbolId: 'render-data:0', kind: 'render-data' }],
			},
		],
	});
	const after = computeLinkedInterfaces({
		imports,
		claims: [
			{
				source: '/app/widget.tsrx',
				symbols: [
					{ symbolId: 'render-data:0', kind: 'render-data' },
					{ symbolId: 'render-data:1', kind: 'render-data' },
				],
			},
		],
	});
	expect(after.signature).toBe(before.signature);
	expect(after.claimSignature).not.toBe(before.claimSignature);
});

test('the claim signature is stable across claim order and repeated sources', () => {
	const widgetClaim = { source: '/app/widget.tsrx', symbols: [{ symbolId: 's0' }] };
	const panelClaim = { source: '/app/panel.tsrx', symbols: [{ symbolId: 's1' }] };
	const claimSignature = (claims: ReadonlyArray<typeof widgetClaim>) =>
		computeLinkedInterfaces({ imports: [], claims }).claimSignature;
	expect(claimSignature([widgetClaim, panelClaim])).toBe(claimSignature([panelClaim, widgetClaim]));
	expect(claimSignature([widgetClaim, widgetClaim, panelClaim])).toBe(
		claimSignature([widgetClaim, panelClaim]),
	);
	expect(claimSignature([widgetClaim])).not.toBe(claimSignature([widgetClaim, panelClaim]));
});
