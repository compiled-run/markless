import { expect, test } from 'vitest';
import { isolateMdxPayload } from './payload-scope.ts';
import { protocolStateVersion } from '../../../packages/serializer/src/protocol-constants.ts';

test.each(['m3:', 'm8:c2:'])(
	'diagnostic scope %s preserves markup, script count and DOM positions',
	(prefix) => {
		const state = {
			version: protocolStateVersion([]),
			cells: [prefix, 'm11:'].map((p) => ({
				graphNodeId: p + 'state:value',
				name: 'value',
				valueKind: 'scalar',
				value: '</script><b>',
			})),
			computed: [],
		};
		const view = {
			version: protocolStateVersion([]),
			locators: [
				{
					hostNodeId: prefix + 'button',
					strategy: 'dom-order',
					index: 18,
					tagName: 'button',
				},
			],
			events: [
				{
					hostNodeId: prefix + 'button',
					eventName: 'click',
					symbolIds: [prefix + 'symbol:change'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		};
		const html =
			'<p>Unchanged</p><button>Ready</button>' +
			`<script type="markless/state">${JSON.stringify(state).replaceAll('<', '\\u003c')}</script>` +
			`<script type="markless/view">${JSON.stringify(view)}</script>`;
		const isolated = isolateMdxPayload(html, prefix);
		expect(isolated.startsWith('<p>Unchanged</p><button>Ready</button>')).toBe(true);
		expect(isolated.match(/<script/g)).toHaveLength(2);
		expect(isolated).not.toContain('m11:state:value');
		expect(isolated).toContain('"index":18');
		expect(isolated).toContain('\\u003c/script>');
	},
);

test('diagnostic scope refuses missing payloads', () => {
	expect(() => isolateMdxPayload('<button>Ready</button>', 'm3:')).toThrow(
		'requires state and view',
	);
});

test.each(['m3:', 'm9:c4:'])(
	'unchecked diagnostic %s keeps owned handles and state without claiming closure',
	async (prefix) => {
		const { isolateUncheckedMdxPayload } = await import('./payload-scope.ts');
		const state = {
			version: protocolStateVersion([]),
			cells: [prefix, 'm20:'].map((p) => ({ graphNodeId: p + 'state:open', value: false })),
			computed: [
				{
					graphNodeId: prefix + 'computed:open',
					dependencies: [{ graphNodeId: 'm20:state:open', path: [] }],
				},
			],
			sharedDefinitions: [{ id: prefix + 'shared:panel' }, { id: 'm20:shared:panel' }],
			sharedSeeds: [],
			storage: [],
		};
		const view = {
			version: protocolStateVersion([]),
			locators: [
				{
					hostNodeId: prefix + 'toggle',
					strategy: 'dom-order',
					index: 23,
					tagName: 'button',
				},
			],
			events: [
				{
					hostNodeId: prefix + 'toggle',
					eventName: 'click',
					symbolIds: [prefix + 'symbol:flip'],
				},
			],
			domUpdates: [],
			behaviors: [],
			asyncBoundaries: [],
			elementHandles: [
				{ hostNodeId: prefix + 'toggle', handleId: prefix + 'handle:toggle' },
				{ hostNodeId: 'm20:other', handleId: 'm20:handle:other' },
			],
			branches: [{ id: prefix + 'branch:panel' }, { id: 'm20:branch:other' }],
			keyedRepeats: [],
		};
		const markup = '<button>Toggle</button>';
		const html =
			markup +
			`<script type="markless/state">${JSON.stringify(state)}</script><script type="markless/view">${JSON.stringify(view)}</script>`;
		expect(() => isolateMdxPayload(html, prefix)).toThrow('refused');
		const isolated = isolateUncheckedMdxPayload(html, prefix);
		const selectedState = JSON.parse(
			/<script type="markless\/state">([\s\S]*?)<\/script>/.exec(isolated)![1]!,
		);
		const selectedView = JSON.parse(
			/<script type="markless\/view">([\s\S]*?)<\/script>/.exec(isolated)![1]!,
		);
		expect(isolated.startsWith(markup)).toBe(true);
		expect(selectedState.cells).toHaveLength(1);
		expect(selectedState.computed[0].dependencies[0].graphNodeId).toBe('m20:state:open');
		expect(selectedState.sharedDefinitions).toHaveLength(1);
		expect(selectedView.elementHandles).toHaveLength(1);
		expect(selectedView.branches).toHaveLength(1);
		expect(selectedView.locators[0].index).toBe(23);
	},
);
