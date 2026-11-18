import type { CompilerDiagnostic } from '@markless/compiler';
import { DEVICE_FEATURES, type NativeDeviceFeature } from '@markless/serializer/native-device';

export const DEVICE_USAGE_MISSING_CODE = 'MARKLESS_DEVICE_USAGE_MISSING';

/** The app config's device section: the text each platform shows when it asks for a feature. */
export type DeviceAppConfig = {
	readonly usage?: Readonly<Partial<Record<NativeDeviceFeature, string>>>;
};

/** What the app's Info.plist and AndroidManifest.xml must declare for the features a build uses. */
export type DeviceManifest = {
	readonly ios: ReadonlyArray<{ readonly key: string; readonly text: string }>;
	readonly android: ReadonlyArray<string>;
};

/** The manifest entries for `features`, or a diagnostic naming each Info.plist key whose usage text the config lacks. */
export function deviceManifest(
	features: ReadonlyArray<NativeDeviceFeature>,
	config: DeviceAppConfig = {},
): { readonly manifest: DeviceManifest; readonly diagnostics: ReadonlyArray<CompilerDiagnostic> } {
	const diagnostics: CompilerDiagnostic[] = [];
	const ios: { key: string; text: string }[] = [];
	const android = new Set<string>();
	for (const feature of features) {
		const facts = DEVICE_FEATURES[feature];
		for (const permission of facts.androidPermissions) android.add(permission);
		for (const key of facts.iosUsageKeys) {
			const text = config.usage?.[feature]?.trim();
			if (text) ios.push({ key, text });
			else
				diagnostics.push({
					code: DEVICE_USAGE_MISSING_CODE,
					severity: 'error',
					phase: 'serialization',
					title: 'A device feature has no usage text',
					message: `${key} has no usage text; add device.usage.${feature} to the app config`,
					why: `The app uses ${feature}, and iOS refuses to ask for it without a sentence saying why.`,
					passId: 'native-view',
					suggestions: [
						{
							message: `Set device.usage.${feature} to the sentence the person sees when asked.`,
						},
					],
					docsUrl: `https://markless.dev/errors/${DEVICE_USAGE_MISSING_CODE}`,
				});
		}
	}
	return { manifest: { ios, android: [...android] }, diagnostics };
}
