```tsrx
import { state } from '@markless/core';
import { cameraPermission, ImagePicker, type Picture } from '@markless/device';

export default function Snap() @{
	const permission = cameraPermission();
	let photo = state<Picture | null>(null);

	<section>
		<button
			onClick={async () => {
				if (permission.state !== 'granted' && (await permission.request()) !== 'granted') return;
				const result = await ImagePicker.launchCamera();
				if (!result.canceled) photo = result.assets[0];
			}}
		>
			Take photo
		</button>
		@if (photo) {
			<img src={photo.uri} alt="Photo you took" />
		}
	</section>
}
```
