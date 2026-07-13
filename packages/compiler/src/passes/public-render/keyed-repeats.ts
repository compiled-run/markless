import type { PublicRenderPlanArtifact } from '../../artifacts.ts';
import {
	domNodePathExpression,
	graphReadExpression,
	itemPathReadSource,
	samePath,
} from './source-expressions.ts';

type KeyedRepeatPlan = PublicRenderPlanArtifact['keyedRepeats'][number];

export function publicRepeatSyncCall(
	publicRenderPlan: PublicRenderPlanArtifact,
	graphSource: string,
	loadSymbolSource: string,
	repeatStateSource: string | null = null,
): string | null {
	if (publicRenderPlan.keyedRepeats.length === 0) return null;
	if (publicRenderPlan.keyedRepeats.length === 1) {
		const stateArgument = repeatStateSource ? `, ${repeatStateSource}` : '';
		return `syncMarklessPublicRepeat0(root, ${graphSource}, ${loadSymbolSource}${stateArgument});`;
	}

	return `syncMarklessPublicRepeats(root, ${graphSource}, ${loadSymbolSource});`;
}

export function emitRepeatCalls(publicRenderPlan: PublicRenderPlanArtifact): ReadonlyArray<string> {
	return publicRenderPlan.keyedRepeats.map(
		(_repeat, index) =>
			`	syncMarklessPublicRepeat${index}(root, graph, loadSymbolForRepeat);`,
	);
}

export function emitRepeatFunctions(
	publicRenderPlan: PublicRenderPlanArtifact,
	options: { readonly hasSingleRepeat: boolean },
): ReadonlyArray<string> {
	return publicRenderPlan.keyedRepeats.flatMap((repeat, index) => [
		emitRepeatRowFunction(repeat, index),
		emitRepeatEmptyFunction(repeat, index),
		emitRepeatRecordFunction(repeat, index),
		emitRepeatSyncFunction(repeat, index, options),
		emitRepeatPatchFunction(repeat, index),
		emitRepeatWriteFunction(repeat, index),
		emitRepeatEventFunction(repeat, index),
	]);
}

export function emitRepeatSupportFunctions(input: {
	readonly hasRepeats: boolean;
	readonly hasSingleRepeat: boolean;
	readonly useSingleRepeatClassValue: boolean;
	readonly repeatCalls: ReadonlyArray<string>;
	readonly repeatFunctions: ReadonlyArray<string>;
}): string[] {
	if (!input.hasRepeats) return [];

	return [
		...(input.hasSingleRepeat
			? []
			: [
					'function syncMarklessPublicRepeats(root, graph, loadSymbolForRepeat) {',
					...input.repeatCalls,
					'}',
					'',
					'function repeatState(root, planIndex) {\n\tlet states = marklessPublicRepeatStates.get(root);\n\tif (!states) { states = []; marklessPublicRepeatStates.set(root, states); }\n\tif (!states[planIndex]) states[planIndex] = { rows: new Map(), keys: [], classValues: [] };\n\treturn states[planIndex];\n}',
					'',
				]),
		'',
		...input.repeatFunctions,
		'',
	].filter((part): part is string => part !== null);
}

function emitRepeatSyncFunction(
	repeat: KeyedRepeatPlan,
	index: number,
	options: { readonly hasSingleRepeat: boolean },
) {
	const useSingleClassValue = repeat.classWrites.length === 1;
	const classValueName = useSingleClassValue ? 'classValue' : 'classValues';
	const classStateName = useSingleClassValue ? 'classValue' : 'classValues';
	const attachEventsCall =
		repeat.eventControls.length > 0
			? `\n\t\t\tattachMarklessPublicRepeat${index}Events(record);`
			: '';
	const delegateEventsCall =
		repeat.eventControls.length > 0
			? `\n\tdelegateMarklessPublicRepeat${index}Events(parent, graph, loadSymbolForRepeat);`
			: '';
	const stateParameter = options.hasSingleRepeat ? ', state' : '';
	const stateDeclaration = options.hasSingleRepeat
		? ''
		: `\n\tconst state = repeatState(root, ${index});`;
	const clearRowsFunction = useSingleClassValue
		? 'clearMarklessPublicSingleClassRows'
		: 'clearMarklessPublicRows';

	return [
		`function syncMarklessPublicRepeat${index}(root, graph, loadSymbolForRepeat${stateParameter}) {\n\tconst parent = ${domNodePathExpression('root', repeat.parentPath)};\n\tif (!parent?.replaceChildren) return;${stateDeclaration}${delegateEventsCall}\n\tconst collectionDirty = graph.isDirty?.(${JSON.stringify(repeat.collectionGraphNodeId)}) ?? true;\n\tconst classDirty = ${classDirtyExpression(repeat)};\n\tif (!collectionDirty && state.keys.length > 0) {\n\t\tif (classDirty) {\n\t\t\tconst ${classValueName} = readMarklessPublicRepeat${index}ClassValues(graph);\n\t\t\tupdateMarklessPublicRepeat${index}Classes(state, ${classValueName});\n\t\t\tstate.${classStateName} = ${classValueName};\n\t\t}\n\t\treturn;\n\t}\n\tconst itemsValue = ${graphReadExpression(repeat.collectionGraphNodeId, repeat.collectionPath)};\n\tconst items = Array.isArray(itemsValue) ? itemsValue : Array.from(itemsValue ?? []);\n\tif (items.length === 0) { ${clearRowsFunction}(parent, state); renderMarklessPublicRepeat${index}Empty(parent); return; }\n\tconst ${classValueName} = readMarklessPublicRepeat${index}ClassValues(graph);\n\tconst hadRows = state.keys.length > 0;\n\tconst dirtyIndexes = graph.dirtyIndexes?.(${JSON.stringify(repeat.collectionGraphNodeId)});\n\tif (hadRows && dirtyIndexes && dirtyIndexes.length < items.length && patchMarklessPublicRepeat${index}DirtyRows(state, items, dirtyIndexes, ${classValueName})) {\n\t\tif (classDirty) updateMarklessPublicRepeat${index}Classes(state, ${classValueName});\n\t\tstate.${classStateName} = ${classValueName};\n\t\treturn;\n\t}\n\tlet canAppend = hadRows && state.keys.length < items.length;\n\tlet reusedRows = 0;\n\tconst newRows = document.createDocumentFragment();\n\tconst nextKeys = [];`,
		`	const seenKeys = new Set();\n\tfor (let index = 0; index < items.length; index++) {\n\t\tconst item = items[index];\n\t\tconst key = ${itemPathReadSource('item', repeat.keyPath)};\n\t\tassertUniqueMarklessPublicRepeatKey(seenKeys, ${JSON.stringify(repeat.repeatId)}, ${JSON.stringify(repeat.itemName)}, ${JSON.stringify(repeat.keyPath)}, key);\n\t\tif (canAppend && index < state.keys.length && state.keys[index] !== key) canAppend = false;\n\t\tnextKeys.push(key);\n\t\tlet record = state.rows.get(key);\n\t\tif (!record) {\n\t\t\tconst rowRoot = createMarklessPublicRepeat${index}Row();\n\t\t\trecord = createMarklessPublicRepeat${index}Record(rowRoot, item);\n\t\t\tstate.rows.set(key, record);\n\t\t\twriteMarklessPublicRepeat${index}Row(record, item, ${classValueName});${attachEventsCall}\n\t\t\tnewRows.appendChild(record.root);\n\t\t} else if (record.item !== item) {\n\t\t\treusedRows++;\n\t\t\trecord.item = item;\n\t\t\twriteMarklessPublicRepeat${index}Row(record, item, ${classValueName});\n\t\t} else {\n\t\t\treusedRows++;\n\t\t\trecord.item = item;\n\t\t}\n\t}`,
		`	if (!hadRows) {\n\t\tif (parent.childNodes?.length === 0 && parent.appendChild) parent.appendChild(newRows);\n\t\telse parent.replaceChildren(newRows);\n\t} else if (parent.childNodes?.length === 0) {\n\t\treplaceMarklessPublicRows(parent, state, nextKeys);\n\t} else if (canAppend) {\n\t\tparent.appendChild?.(newRows);\n\t} else if (reusedRows === 0) {\n\t\tparent.replaceChildren(newRows);\n\t} else if (!sameMarklessPublicKeys(state.keys, nextKeys) &&\n\t\t!removeMarklessPublicMissingKey(parent, state, nextKeys) &&\n\t\t!swapMarklessPublicRows(parent, state, nextKeys)) {\n\t\treplaceMarklessPublicRows(parent, state, nextKeys);\n\t}\n\tif (state.rows.size !== nextKeys.length) pruneMarklessPublicRows(state, nextKeys);\n\tif (hadRows) updateMarklessPublicRepeat${index}Classes(state, ${classValueName});\n\tstate.${classStateName} = ${classValueName};\n\tstate.keys = nextKeys;\n}`,
		'',
	].join('\n');
}

function emitRepeatEmptyFunction(repeat: KeyedRepeatPlan, index: number) {
	if (!repeat.emptyTemplateHtml) {
		return [`function renderMarklessPublicRepeat${index}Empty() {}`, ''].join('\n');
	}
	const templateName = `marklessPublicRepeat${index}EmptyTemplate`;
	return [
		`let ${templateName};`,
		`function renderMarklessPublicRepeat${index}Empty(parent) {`,
		`\tif (!${templateName}) {`,
		`\t\t${templateName} = document.createElement("template");`,
		`\t\t${templateName}.innerHTML = ${JSON.stringify(repeat.emptyTemplateHtml)};`,
		'\t}',
		`\tconst content = ${templateName}.content.cloneNode(true);`,
		'\tif (parent.replaceChildren) parent.replaceChildren(content);',
		'}',
		'',
	].join('\n');
}

function emitRepeatRowFunction(repeat: KeyedRepeatPlan, index: number) {
	const templateName = `marklessPublicRepeat${index}Template`;
	return [
		`let ${templateName};`,
		`function createMarklessPublicRepeat${index}Row() {`,
		`\tif (!${templateName}) {`,
		`\t\t${templateName} = document.createElement("template");`,
		`\t\t${templateName}.innerHTML = ${JSON.stringify(repeat.rowTemplateHtml)};`,
		'\t}',
		`\tconst row = ${templateName}.content.firstElementChild?.cloneNode(true);`,
		'\tif (!row) throw new Error("Markless repeat template did not create a row element.");',
		'\treturn row;',
		'}',
		'',
	].join('\n');
}

function emitRepeatPatchFunction(repeat: KeyedRepeatPlan, index: number) {
	const useSingleClassValue = repeat.classWrites.length === 1;
	const classParameter = useSingleClassValue ? 'classValue' : 'classValues';
	return [
		`function patchMarklessPublicRepeat${index}DirtyRows(state, items, dirtyIndexes, ${classParameter}) {`,
		'\tfor (const index of dirtyIndexes) {',
		'\t\tconst item = items[index];',
		`\t\tconst key = ${itemPathReadSource('item', repeat.keyPath)};`,
		'\t\tif (state.keys[index] !== key) return false;',
		'\t\tconst record = state.rows.get(key);',
		'\t\tif (!record) return false;',
		'\t\trecord.item = item;',
		`\t\twriteMarklessPublicRepeat${index}Row(record, item, ${classParameter});`,
		'\t}',
		'\treturn true;',
		'}',
		'',
	].join('\n');
}

function emitRepeatRecordFunction(repeat: KeyedRepeatPlan, index: number) {
	const targetEntries = [
		'\t\troot: row,',
		'\t\titem,',
		...repeat.textWrites.map(
			(write, writeIndex) =>
				`\t\ttext${writeIndex}: ${domNodePathExpression('row', write.nodePath)},`,
		),
		...repeat.classWrites.map(
			(write, writeIndex) =>
				`\t\tclass${writeIndex}: ${domNodePathExpression('row', write.hostPath)},`,
		),
		...repeat.eventControls.map(
			(eventControl, eventIndex) =>
				`\t\tevent${eventIndex}: ${domNodePathExpression('row', eventControl.hostPath)},`,
		),
	];

	return [
		`function createMarklessPublicRepeat${index}Record(row, item) {`,
		'\treturn {',
		...targetEntries,
		'\t};',
		'}',
		'',
	].join('\n');
}

function emitRepeatWriteFunction(repeat: KeyedRepeatPlan, index: number) {
	const useSingleClassValue = repeat.classWrites.length === 1;
	const classParameter = useSingleClassValue ? 'classValue' : 'classValues';
	const textWrites = repeat.textWrites.flatMap((write, writeIndex) => [
		`	const textTarget${writeIndex} = record.text${writeIndex};`,
		`	const nextTextValue${writeIndex} = stringifyMarklessPublicValue(${itemPathReadSource('item', write.itemPath)});`,
		`	if (textTarget${writeIndex} && textTarget${writeIndex}.nodeValue !== nextTextValue${writeIndex}) textTarget${writeIndex}.nodeValue = nextTextValue${writeIndex};`,
	]);
	const classWrites = repeat.classWrites.flatMap((write, writeIndex) => [
		`	const classTarget${writeIndex} = record.class${writeIndex};`,
		`	const stateValue${writeIndex} = ${useSingleClassValue ? classParameter : `${classParameter}[${writeIndex}]`};`,
		`	const itemValue${writeIndex} = ${itemPathReadSource('item', write.itemPath)};`,
		write.falseClass === ''
			? `	if (stateValue${writeIndex} === itemValue${writeIndex}) classTarget${writeIndex}?.setAttribute?.("class", ${JSON.stringify(write.trueClass)});`
			: `	classTarget${writeIndex}?.setAttribute?.("class", stateValue${writeIndex} === itemValue${writeIndex} ? ${JSON.stringify(write.trueClass)} : ${JSON.stringify(write.falseClass)});`,
	]);

	return [
		emitRepeatClassValuesFunction(repeat, index),
		`function writeMarklessPublicRepeat${index}Row(record, item, ${classParameter}) {`,
		...textWrites,
		...classWrites,
		'}',
		'',
		emitRepeatClassStateFunction(repeat, index),
	].join('\n');
}

function classDirtyExpression(repeat: KeyedRepeatPlan): string {
	const dirtyChecks = repeat.classWrites.map(
		(write) => `graph.isDirty?.(${JSON.stringify(write.stateGraphNodeId)})`,
	);
	return dirtyChecks.length > 0 ? dirtyChecks.join(' || ') : 'false';
}

function emitRepeatClassValuesFunction(repeat: KeyedRepeatPlan, index: number) {
	const classReads = repeat.classWrites.map((write) =>
		graphReadExpression(write.stateGraphNodeId, write.statePath),
	);
	const returnSource = classReads.length === 1 ? classReads[0] : `[${classReads.join(', ')}]`;

	return [
		`function readMarklessPublicRepeat${index}ClassValues(graph) {`,
		`\treturn ${returnSource};`,
		'}',
		'',
	].join('\n');
}

function emitRepeatClassStateFunction(repeat: KeyedRepeatPlan, index: number) {
	const useSingleClassValue = repeat.classWrites.length === 1;
	const classParameter = useSingleClassValue ? 'classValue' : 'classValues';
	const stateChecks = repeat.classWrites.flatMap((write, writeIndex) => [
		`	const stateValue${writeIndex} = ${useSingleClassValue ? classParameter : `${classParameter}[${writeIndex}]`};`,
		`	if (${useSingleClassValue ? 'state.classValue' : `state.classValues[${writeIndex}]`} !== stateValue${writeIndex}) {`,
		`		updateMarklessPublicRepeat${index}Class${writeIndex}(state, ${useSingleClassValue ? 'state.classValue' : `state.classValues[${writeIndex}]`}, stateValue${writeIndex});`,
		`		updateMarklessPublicRepeat${index}Class${writeIndex}(state, stateValue${writeIndex}, stateValue${writeIndex});`,
		'	}',
	]);
	const classUpdaters = repeat.classWrites.flatMap((write, writeIndex) =>
		samePath(write.itemPath, repeat.keyPath)
			? [
					`function updateMarklessPublicRepeat${index}Class${writeIndex}(state, matchValue, stateValue${writeIndex}) {`,
					'	const record = state.rows.get(matchValue);',
					'	if (!record) return;',
					`	const classTarget${writeIndex} = record.class${writeIndex};`,
					`	classTarget${writeIndex}?.setAttribute?.("class", stateValue${writeIndex} === matchValue ? ${JSON.stringify(write.trueClass)} : ${JSON.stringify(write.falseClass)});`,
					'}',
					'',
				]
			: [
					`function updateMarklessPublicRepeat${index}Class${writeIndex}(state, matchValue, stateValue${writeIndex}) {`,
					'	for (const record of state.rows.values()) {',
					`		const itemValue${writeIndex} = ${itemPathReadSource('record.item', write.itemPath)};`,
					`		if (itemValue${writeIndex} !== matchValue) continue;`,
					`		const classTarget${writeIndex} = record.class${writeIndex};`,
					`		classTarget${writeIndex}?.setAttribute?.("class", stateValue${writeIndex} === itemValue${writeIndex} ? ${JSON.stringify(write.trueClass)} : ${JSON.stringify(write.falseClass)});`,
					'	}',
					'}',
					'',
				],
	);

	return [
		`function updateMarklessPublicRepeat${index}Classes(state, ${classParameter}) {`,
		...stateChecks,
		'}',
		'',
		...classUpdaters,
	].join('\n');
}

function emitRepeatEventFunction(repeat: KeyedRepeatPlan, index: number) {
	const eventGroups = new Map<
		string,
		Array<{
			readonly eventControl: KeyedRepeatPlan['eventControls'][number];
			readonly eventIndex: number;
		}>
	>();
	repeat.eventControls.forEach((eventControl, eventIndex) => {
		const controls = eventGroups.get(eventControl.eventName) ?? [];
		controls.push({ eventControl, eventIndex });
		eventGroups.set(eventControl.eventName, controls);
	});
	const eventMarkers = repeat.eventControls.flatMap((_eventControl, eventIndex) => [
		`	const element${eventIndex} = record.event${eventIndex};`,
		`	if (element${eventIndex}) element${eventIndex}.__marklessPublicRepeat${index}Event${eventIndex} = record;`,
	]);
	const delegates = [...eventGroups].flatMap(([eventName, controls]) => [
		`	parent.addEventListener(${JSON.stringify(eventName)}, async (event) => {`,
		'		let eventTarget = event.target;',
		'		while (eventTarget && eventTarget !== parent) {',
		...controls.flatMap(({ eventControl, eventIndex }) => [
			'			{',
			`				const record = eventTarget?.__marklessPublicRepeat${index}Event${eventIndex};`,
			'				if (record) {',
			`					const loaded = loadSymbolForRepeat(${JSON.stringify(eventControl.symbolId)});`,
			'					const symbol = isMarklessPublicThenable(loaded) ? await loaded : loaded;',
			`					const value = symbol({ graph, event, element: eventTarget, getElementHandle: () => undefined, locals: { ${JSON.stringify(eventControl.itemContext.itemName)}: record.item } });`,
			'					if (isMarklessPublicThenable(value)) await value;',
			'					graph.flush();',
			'					return;',
			'				}',
			'			}',
		]),
		'			eventTarget = eventTarget.parentElement || eventTarget.parentNode;',
		'		}',
		'	});',
	]);

	return [
		`function delegateMarklessPublicRepeat${index}Events(parent, graph, loadSymbolForRepeat) {`,
		`\tif (parent.__marklessPublicRepeat${index}DelegatedEvents || !parent.addEventListener) return;`,
		`\tparent.__marklessPublicRepeat${index}DelegatedEvents = true;`,
		...delegates,
		'}',
		'',
		`function attachMarklessPublicRepeat${index}Events(record) {`,
		...eventMarkers,
		'}',
		'',
	].join('\n');
}
