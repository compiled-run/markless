#if canImport(UIKit)
import Foundation
import MarklessCore
import UIKit

/// What a shell shows for the bytes it was built with: one page, or an app of several routes in a navigation stack.
@MainActor
public enum MarklessRoot {
	/// `path`: a deep link's path, else the `-route` launch argument, else `/` (an app) or the page's own route.
	public static func controller(payload: Data, style: Data?, fonts: [String: Data], path: String?, device: NativeDevice? = nil) throws -> UIViewController {
		let opened = path ?? MarklessViewController.launchRoute()
		switch try NativePayload.decode(payload) {
		case .app:
			return try MarklessNavigationController(app: payload, style: style, fonts: fonts, path: opened, device: device)
		case .page:
			return try MarklessViewController(payload: payload, style: style, fonts: fonts, device: device, route: opened)
		}
	}

	/// A deep link while the app runs: the stack becomes the one its path opens.
	public static func open(_ path: String, in root: UIViewController) throws {
		guard let stack = root as? MarklessNavigationController else { throw HostError("opened at \(path), but this app is one page") }
		try stack.open(path)
	}

	/// The path a deep link names: `markless-proof://app/orders/42` opens `/orders/42`.
	public static func path(of url: URL) -> String { url.path.isEmpty ? "/" : url.path }
}
#endif
