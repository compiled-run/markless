// file: pages/media.tsrx
import { state } from '@markless/core';
import { base, system, tabs } from '@markless/ui';
import { camera, type Photo } from '@markless/device';

function CameraPanel() @{
	const cam = camera();
	let photo = state<Photo | null>(null);

	<div>
		<system.camera el={cam} class="preview" />
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
		<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>Front camera</base.button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" class="photo" />
		}
	</div>
}

function DocumentPanel() @{
	let page = state(1);
	let pages = state(0);

	<div>
		<system.pdf src="/guide.pdf" page={page} onLoad={(info) => (pages = info.pages)} class="document" />
		<p>{`Page ${page} of ${pages}`}</p>
		<button disabled={page <= 1} onClick={() => page--}>Previous</button>
		<button disabled={page >= pages} onClick={() => page++}>Next</button>
	</div>
}

export default function Media() @{
	<tabs.root value="camera">
		<tabs.list>
			<tabs.trigger value="camera">Camera</tabs.trigger>
			<tabs.trigger value="document">Document</tabs.trigger>
		</tabs.list>
		<tabs.content value="camera">
			<CameraPanel />
		</tabs.content>
		<tabs.content value="document">
			<DocumentPanel />
		</tabs.content>
	</tabs.root>
}
