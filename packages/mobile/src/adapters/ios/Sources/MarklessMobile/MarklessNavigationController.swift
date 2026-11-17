#if canImport(UIKit)
import Foundation
import MarklessCore
import UIKit

/// Shows a Markless app of several routes as a UIKit stack: one `MarklessViewController` per screen, the page's
/// `<title>` in the navigation bar, and the system back button and edge-swipe gesture popping a screen that kept its views.
@MainActor
public final class MarklessNavigationController: UINavigationController {
	private let app: NativeAppPayload
	private let store: NativeStore

	/// `path`: where the app opens; the stack holds every route above it (`/`, `/orders`, `/orders/42`).
	public init(app: Data, path: String? = nil, store: NativeStore = UserDefaultsStore()) throws {
		self.app = try NativeAppPayload.decode(app)
		self.store = store
		super.init(nibName: nil, bundle: nil)
		try open(path ?? "/")
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("MarklessNavigationController is created from a payload") }

	/// Replaces the whole stack with the one `path` opens: a deep link while the app runs.
	public func open(_ path: String) throws {
		setViewControllers(
			try app.backStack(path).map { prefix in
				guard let (route, params) = app.match(prefix) else { throw HostError("\(prefix) is not a route of this app") }
				return try screen(route.pattern, params)
			}, animated: false)
	}

	private func screen(_ route: String, _ params: [NativeRouteParam]) throws -> MarklessViewController {
		guard let entry = app.routes.first(where: { $0.pattern == route }) else { throw HostError("no page for \(route)") }
		let controller = try MarklessViewController(page: entry.page, params: params, store: store)
		controller.navigator = { [weak self] route, params, replace in
			guard let self else { return }
			let next = try self.screen(route, params)
			if replace {
				self.setViewControllers(Array(self.viewControllers.dropLast()) + [next], animated: true)
			} else {
				self.pushViewController(next, animated: true)
			}
		}
		return controller
	}
}
#endif
