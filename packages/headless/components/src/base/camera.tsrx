import { platform } from '@markless/device';
import type { CameraProps } from './base-types.ts';

// The camera's picture. A phone build makes it the platform's own preview view, bound to the device object passed as
// `el`; on the web the camera is absent, so a web build removes this markup and the part renders nothing.
export default function Camera(_props: CameraProps) @{
	<>
		@if (!platform.web) {
			<div ui-camera></div>
		}
	</>
}
