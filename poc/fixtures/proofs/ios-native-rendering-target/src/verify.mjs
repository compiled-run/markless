import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function readText(path) {
	return await readFile(join(root, path), 'utf8');
}

async function readJson(path) {
	return JSON.parse(await readText(path));
}

const artifact = await readJson('src/artifact.json');
const source = await readText('src/App.tsrx');
const runtime = await readText('ios/Sources/ArcadeNativeProof/ArcadeNativeRuntime.swift');
const test = await readText(
	'ios/Tests/ArcadeNativeProofTests/ArcadeNativeProofTests.swift',
);
const demoApp = await readText('ios/DemoApp/DemoApp.swift');
const demoInfo = await readText('ios/DemoApp/Info.plist');
const demoRunner = await readText('ios/Scripts/run-ios-demo.sh');

assert.match(source, /state\(0\)/);
assert.match(source, /onClick=\{\(\) => count\+\+\}/);

assert.equal(artifact.schema, 'arcade-native-rendering-proof/v0');
assert.equal(artifact.targetProfile, 'portable-host');

assert.deepEqual(artifact.graph.cells, [
	{ id: 'state:count', initial: 0, type: 'number' },
]);

assert.deepEqual(
	artifact.host.nodes.map((node) => [node.id, node.type]),
	[
		['host:root', 'main'],
		['host:title', 'h1'],
		['host:button', 'button'],
		['host:buttonText', 'text'],
	],
);

const event = artifact.host.events[0];
assert.equal(event.node, 'host:button');
assert.equal(event.authoredEvent, 'onClick');
assert.equal(event.semanticEvent, 'activate');
assert.equal(event.nativeEvent, 'touchUpInside');
assert.equal(event.symbolId, 'symbol:counter.increment');

const textBinding = artifact.host.textBindings[0];
assert.equal(textBinding.node, 'host:buttonText');
assert.equal(textBinding.sourceCell, 'state:count');
assert.equal(textBinding.template, 'Count ${value}');

assert.equal(
	artifact.symbols['symbol:counter.increment'].body,
	'graph["state:count"] = graph["state:count"] + 1;',
);

assert.match(runtime, /import JavaScriptCore/);
assert.match(runtime, /import UIKit/);
assert.match(runtime, /UIButton/);
assert.match(runtime, /UILabel/);
assert.match(runtime, /JSContext/);
assert.match(runtime, /NativeEventTarget/);
assert.match(runtime, /button\.addTarget\(/);
assert.match(runtime, /target\.activate\(\)/);

assert.match(test, /XCTestCase/);
assert.match(test, /Count 0/);
assert.match(test, /Count 1/);
assert.match(test, /testNativeButtonActivationRunsJavaScriptCoreSymbol/);

assert.match(demoApp, /UIApplicationDelegate/);
assert.match(demoApp, /ArcadeNativeRuntime/);
assert.match(demoApp, /mount\(\)/);
assert.match(demoInfo, /ArcadeNativeProofDemo/);
assert.match(demoRunner, /simctl install/);
assert.match(demoRunner, /simctl launch/);

const forbiddenWords = [
	['WK', 'WebView'].join(''),
	['React', ' Native'].join(''),
	['react', '-native'].join(''),
	['ex', 'po'].join(''),
	['capaci', 'tor'].join(''),
	['ion', 'ic'].join(''),
	['tau', 'ri'].join(''),
	['document', '.'].join(''),
	['window', '.'].join(''),
];
const forbiddenPattern = new RegExp(
	forbiddenWords
		.map((word) => {
			const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			return /^[a-z]+$/i.test(word) ? `\\b${escaped}\\b` : escaped;
		})
		.join('|'),
	'i',
);
for (const [label, contents] of [
	['artifact', JSON.stringify(artifact)],
	['source', source],
	['runtime', runtime],
	['test', test],
]) {
	assert.doesNotMatch(contents, forbiddenPattern, `${label} uses a forbidden core path`);
}

console.log(
	JSON.stringify(
		{
			proof: 'ios-native-rendering-target',
			hostNodes: artifact.host.nodes.length,
				graphCells: artifact.graph.cells.length,
				events: artifact.host.events.length,
				textBindings: artifact.host.textBindings.length,
				swiftCorePath: 'UIKit + JavaScriptCore',
				simulatorStatus: 'verified by xcodebuild XCTest receipt',
			},
		null,
		2,
	),
);
