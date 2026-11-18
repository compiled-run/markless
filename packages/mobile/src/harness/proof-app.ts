/** The one app id both shells install under, so one flow.yaml (`appId: ${APP_ID}`) runs on iOS and Android. */
export const PROOF_APP_ID = 'dev.markless.proof';

/** The Maestro env variable a rung's flow names its app by. */
export const PROOF_APP_ID_VARIABLE = 'APP_ID';

export const PROOF_APP_NAME = 'Proof';

/**
 * The URL scheme both shells register: a flow opens the app at a deep link (`markless-proof://app/orders/42`), and a test
 * build sets a device value (`markless-proof://device/<live value>?value=<json>`).
 */
export const PROOF_URL_SCHEME = 'markless-proof';

/** Where both shells read the build's bytes: inside the iOS bundle, inside the APK's assets. */
export const PROOF_PAYLOAD_PATH = 'markless/payload.json';
export const PROOF_STYLE_PATH = 'markless/style.json';
export const PROOF_FONTS_FOLDER = 'markless-fonts';

export const ANDROID_SHELL_ACTIVITY = 'dev.markless.proof.ShellActivity';

export type ProofPlatform = 'ios' | 'android';
export const PROOF_PLATFORMS: ReadonlyArray<ProofPlatform> = ['ios', 'android'];
