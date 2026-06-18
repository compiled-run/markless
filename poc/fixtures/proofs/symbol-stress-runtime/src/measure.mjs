import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { emitSymbolResolverModule } from '../../../../../packages/compiler/src/passes/symbol-resolver-module.ts';
import { FakeDocument, FakeElement, createClickEvent } from '../../resumer-script/src/fake-dom.mjs';
import { eventOnlyResumerSource } from '../../resumer-script/src/resumer-source.mjs';

const DEFAULT_COUNTS = [10, 100, 500, 1000];

const counts = parseCounts(process.argv.slice(2));
const cases = [];

for (const count of counts) {
	cases.push(await measureCardinality(count));
}

const report = {
	ok: true,
	proof: 'symbol-stress-runtime',
	environment: {
		runtime: 'node',
		dom: 'poc fake DOM',
		dynamicImports: 'data URL modules',
	},
	counts,
	cases,
};

console.log(JSON.stringify(report, null, 2));

async function measureCardinality(symbolCount) {
	const compactResolver = await measureCompactResolver(symbolCount);
	const eventOnlyResumer = await measureEventOnlyResumer(symbolCount);

	return {
		symbolCount,
		compactResolver,
		eventOnlyResumer,
	};
}

async function measureCompactResolver(symbolCount) {
	const stress = createStressState();
	globalThis.__symbolStressRuntime = stress;

	const symbols = Array.from({ length: symbolCount }, (_, index) => ({
		id: symbolId(index),
		chunk: dataModuleUrl(compactModuleSource(index), `compact-${symbolCount}-${index}`),
		exportName: exportName(index),
	}));
	const source = emitSymbolResolverModule({
		buildId: `stress:${symbolCount}`,
		resolverId: 'symbol-stress-runtime',
		symbols,
	});
	const hasSwitch = source.includes('switch (id)');
	assert.equal(hasSwitch, false, 'compact resolver source must not contain switch (id)');
	assert.equal(source.includes('case "symbol:'), false, 'compact resolver must not emit cases');

	const generatedModule = await measureAsync(
		() => import(dataModuleUrl(source, `resolver-${symbolCount}`)),
	);
	const resolver = generatedModule.value;

	const first = await loadAndRun(resolver, 0);
	const middle = await loadAndRun(resolver, Math.floor(symbolCount / 2));
	const last = await loadAndRun(resolver, symbolCount - 1);
	const all = await measureAsync(async () => {
		for (let index = 0; index < symbolCount; index++) {
			const symbol = await resolver.loadSymbol(symbolId(index));
			const result = symbol();
			assert.equal(result, index, `compact resolver loaded wrong symbol ${index}`);
		}
	});

	assert.equal(stress.importedSymbols.size, symbolCount);
	assert.equal(stress.handlerRuns.length, symbolCount + 3);

	return {
		distinctSymbols: symbolCount,
		sourceBytes: byteLength(source),
		hasSwitch,
		resolverModuleImportMs: generatedModule.ms,
		firstSymbolLoadMs: first.ms,
		middleSymbolLoadMs: middle.ms,
		lastSymbolLoadMs: last.ms,
		allSymbolsLoadMs: all.ms,
		importedSymbolModules: stress.importedSymbols.size,
		handlerRuns: stress.handlerRuns.length,
	};
}

async function loadAndRun(resolver, index) {
	return await measureAsync(async () => {
		const symbol = await resolver.loadSymbol(symbolId(index));
		const result = symbol();
		assert.equal(result, index, `compact resolver loaded wrong symbol ${index}`);
	});
}

async function measureEventOnlyResumer(symbolCount) {
	const stress = createStressState();
	globalThis.__symbolStressRuntime = stress;

	const root = new FakeElement('section', { 'data-async': '', 'data-count': '0' });
	const buttons = Array.from({ length: symbolCount }, (_, index) => {
		const button = root.appendChild(
			new FakeElement('button', {
				type: 'button',
				'data-symbol-index': String(index),
			}),
		);
		button.textContent = `Symbol ${index}`;
		return button;
	});
	const viewScript = root.appendChild(new FakeElement('script', { type: 'arcade/view' }));
	viewScript.textContent = JSON.stringify(createViewPayload(symbolCount));
	const resumerScript = root.appendChild(
		new FakeElement('script', { type: 'module', 'data-async-resumer': '' }),
	);
	resumerScript.textContent = eventOnlyResumerSource();

	const document = new FakeDocument(root);
	document.currentScript = resumerScript;
	const previousDocument = globalThis.document;
	const previousProof = globalThis.__resumerProof;
	globalThis.document = document;
	globalThis.__resumerProof = {
		receipts: [],
	};

	let startup;
	try {
		startup = measureSync(() => {
			new Function(resumerScript.textContent)();
		});

		assert.equal(globalThis.__resumerProof.receipts.length, 1);
		assert.equal(globalThis.__resumerProof.receipts[0].stage, 'listener-installed');

		const first = await dispatchMeasured(buttons[0]);
		const middle = await dispatchMeasured(buttons[Math.floor(symbolCount / 2)]);
		const last = await dispatchMeasured(buttons[symbolCount - 1]);
		const all = await measureAsync(async () => {
			for (const button of buttons) {
				await button.dispatchEvent(createClickEvent());
			}
		});

		assert.equal(stress.importedSymbols.size, symbolCount);
		assert.equal(stress.handlerRuns.length, symbolCount + 3);
		assert.equal(root.getAttribute('data-count'), String(symbolCount + 3));

		return {
			distinctSymbols: symbolCount,
			buttonCount: buttons.length,
			viewRows: symbolCount,
			viewPayloadBytes: byteLength(viewScript.textContent),
			startupMs: startup.ms,
			firstClickMs: first.ms,
			middleClickMs: middle.ms,
			lastClickMs: last.ms,
			allClicksMs: all.ms,
			listenerReceipts: globalThis.__resumerProof.receipts.length,
			importedSymbolModules: stress.importedSymbols.size,
			handlerRuns: stress.handlerRuns.length,
			rootCount: Number(root.getAttribute('data-count')),
		};
	} finally {
		restoreGlobal('document', previousDocument);
		restoreGlobal('__resumerProof', previousProof);
		delete globalThis.__symbolStressRuntime;
	}
}

async function dispatchMeasured(button) {
	return await measureAsync(async () => {
		await button.dispatchEvent(createClickEvent());
	});
}

function createViewPayload(symbolCount) {
	const eventNames = ['click'];
	const handlers = [];
	const moduleUrls = [];
	const exportNames = [];

	for (let index = 0; index < symbolCount; index++) {
		handlers.push([index + 1, 0, index, index]);
		moduleUrls.push(dataModuleUrl(pageModuleSource(index), `page-${symbolCount}-${index}`));
		exportNames.push(exportName(index));
	}

	return [eventNames, handlers, moduleUrls, exportNames];
}

function compactModuleSource(index) {
	return [
		`globalThis.__symbolStressRuntime.importedSymbols.add(${JSON.stringify(symbolId(index))});`,
		`export function ${exportName(index)}() {`,
		`	globalThis.__symbolStressRuntime.handlerRuns.push(${JSON.stringify(symbolId(index))});`,
		`	return ${index};`,
		'}',
	].join('\n');
}

function pageModuleSource(index) {
	return [
		`globalThis.__symbolStressRuntime.importedSymbols.add(${JSON.stringify(symbolId(index))});`,
		`export async function ${exportName(index)}({ element, root }) {`,
		'	const count = Number(root.getAttribute("data-count")) + 1;',
		'	root.setAttribute("data-count", String(count));',
		`	element.textContent = ${JSON.stringify(`Clicked ${index}`)};`,
		`	globalThis.__symbolStressRuntime.handlerRuns.push(${JSON.stringify(symbolId(index))});`,
		'	return count;',
		'}',
	].join('\n');
}

function dataModuleUrl(source, label) {
	return `data:text/javascript,${encodeURIComponent(source)}#${encodeURIComponent(label)}`;
}

function symbolId(index) {
	return `symbol:${index}`;
}

function exportName(index) {
	return `onClick_symbol_${index}`;
}

function createStressState() {
	return {
		importedSymbols: new Set(),
		handlerRuns: [],
	};
}

async function measureAsync(callback) {
	const started = performance.now();
	const value = await callback();
	return {
		ms: roundMs(performance.now() - started),
		value,
	};
}

function measureSync(callback) {
	const started = performance.now();
	const value = callback();
	return {
		ms: roundMs(performance.now() - started),
		value,
	};
}

function parseCounts(args) {
	const countsArg = args.find((arg) => arg.startsWith('--counts='));
	const counts = countsArg
		? countsArg
				.slice('--counts='.length)
				.split(',')
				.map((value) => Number(value.trim()))
		: DEFAULT_COUNTS;

	assert.ok(counts.length > 0, 'at least one symbol count is required');
	for (const count of counts) {
		assert.ok(Number.isInteger(count) && count > 0, `invalid symbol count ${count}`);
	}

	return counts;
}

function byteLength(value) {
	return new TextEncoder().encode(value).byteLength;
}

function roundMs(value) {
	return Math.round(value * 1000) / 1000;
}

function restoreGlobal(name, previousValue) {
	if (previousValue === undefined) {
		delete globalThis[name];
	} else {
		globalThis[name] = previousValue;
	}
}
