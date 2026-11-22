import type { NativeAppPayload, NativeViewPayload } from '@markless/serializer';

/** The one app id both shells install under, so one flow.yaml (`appId: ${APP_ID}`) runs on iOS and Android. */
export const PROOF_APP_ID = 'dev.markless.proof';

/** The Maestro env variable a rung's flow names its app by. */
export const PROOF_APP_ID_VARIABLE = 'APP_ID';

export const PROOF_APP_NAME = 'Proof';

/** The URL scheme both shells register, so a flow can open the app at a deep link (`markless-proof://app/orders/42`). */
export const PROOF_URL_SCHEME = 'markless-proof';

/** Where both shells read the build's bytes: inside the iOS bundle, inside the APK's assets. */
export const PROOF_PAYLOAD_PATH = 'markless/payload.json';
export const PROOF_STYLE_PATH = 'markless/style.json';
/** The packaged images' manifest: each `<img src>` the app shows, its file and its natural size. */
export const PROOF_IMAGES_PATH = 'markless/images.json';
/** Where the packaged images' files are, each named by its SHA-256 and format. */
export const PROOF_IMAGES_FOLDER = 'markless-images';
export const PROOF_FONTS_FOLDER = 'markless-fonts';

export const ANDROID_SHELL_ACTIVITY = 'dev.markless.proof.ShellActivity';

export type ProofPlatform = 'ios' | 'android';
export const PROOF_PLATFORMS: ReadonlyArray<ProofPlatform> = ['ios', 'android'];

/** The link scheme both shells answer: `markless-proof://device/<live value>?value=<json>` sets a test build's device value. */
export const PROOF_LINK_SCHEME = PROOF_URL_SCHEME;

/**
 * Whether the app's styles lay text out on the phone: a list's rows, or a page text that follows state, which the plan lays
 * out around its current string. Either needs Dragon's HarfBuzz shim in the APK.
 */
export function stylesShapeText(assets: ReadonlyMap<string, Uint8Array>): boolean {
	const bytes = assets.get(PROOF_STYLE_PATH);
	if (!bytes) return false;
	const style = JSON.parse(new TextDecoder().decode(bytes)) as {
		readonly targets?: { readonly android?: { readonly routes?: ReadonlyArray<{ readonly planRepeats?: ReadonlyArray<unknown> }> } };
	};
	if ((style.targets?.android?.routes ?? []).some((route) => (route.planRepeats ?? []).length > 0)) return true;
	const payload = assets.get(PROOF_PAYLOAD_PATH);
	if (!payload) return false;
	const read = JSON.parse(new TextDecoder().decode(payload)) as NativeViewPayload | NativeAppPayload;
	const pages = 'routes' in read ? read.routes.map((route) => route.page) : [read];
	return pages.some((page) =>
		page.nodes.some((node) => node.kind === 'text' && !node.row && node.parts.some((part) => !('text' in part))),
	);
}
