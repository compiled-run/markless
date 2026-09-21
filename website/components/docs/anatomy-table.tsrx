import AnatomyTableView from './anatomy-table-view.tsrx';
import { familyOf } from './api-derive/manifest.ts';
import { metaIfAny } from './ui-meta/index.ts';
import { scenes } from './anatomy/scenes.ts';
import { deriveAnatomy } from './anatomy/model.ts';

export default function AnatomyTable({ family }: { readonly family?: string }) @{
	const name = family ?? '';
	const scene = scenes[name];
	if (!scene) throw new Error(`No anatomy drawing for ${name}`);
	const anatomy = deriveAnatomy(name, familyOf(name), scene, metaIfAny(name)?.partOrder);
	<AnatomyTableView family={name} data={anatomy} />;
}
