#if canImport(UIKit)
import CryptoKit
import Foundation
import MarklessCore
import UIKit

/// Shows one compiled Markless component as retained UIKit views and runs its handlers as data.
///
/// - `payload`: the compiler's `markless.native-view/0` JSON.
/// - `style`: Dragon's `dragon.native-style-export/0` or `/1` JSON; without it children stack vertically in the system font.
/// - `fonts`: the bytes of every font face the style export names, keyed by its `sha256:` id.
/// - `store`: where storage cells keep their values (`UserDefaults.standard` by default).
///
/// Throws on anything this host does not implement; it never skips a node, op or style write.
@MainActor
public final class MarklessViewController: UIViewController {
	private let payload: NativeViewPayload
	private let style: StyleExport?
	private let fonts: [String: Data]
	private let store: NativeStore
	private var runtime: NativeRuntime
	private var layout: StyleLayout?
	/// The `@media` band the views show; nil without bands.
	private var band: Int?
	private(set) var tree: ViewTree?
	/// In an app: opens the page a `navigate` entry names, pushed or in this screen's place.
	var navigator: ((_ route: String, _ params: [NativeRouteParam], _ replace: Bool) throws -> Void)?

	/// `route`: the path a page opens at, matched against the payload's route; by default the `-route` launch argument.
	public init(
		payload: Data, style: Data? = nil, fonts: [String: Data] = [:], store: NativeStore = UserDefaultsStore(),
		route: String? = MarklessViewController.launchRoute()
	) throws {
		self.payload = try NativeViewPayload.decode(payload)
		self.style = try style.map { try StyleExport.decode($0) }
		if let reason = self.style?.notReady { NSLog("Markless iOS host: applying a style export Dragon marks analysis-only: %@", reason) }
		self.fonts = fonts
		self.store = store
		var params: [NativeRouteParam] = []
		if let route {
			guard let page = self.payload.route else { throw HostError("opened at \(route), but \(self.payload.component) is not a page") }
			guard let matched = page.match(route) else { throw HostError("\(route) does not match the page's route \(page.pattern)") }
			params = matched
		} else if let page = self.payload.route, !page.params.isEmpty {
			throw HostError("\(page.pattern) needs a route to open at, and none was given")
		}
		runtime = NativeRuntime(payload: self.payload, store: store, params: params)
		super.init(nibName: nil, bundle: nil)
		try buildPage()
		followsAppearance()
	}

	/// One screen of an app: the page for a route, opened with its params and its route's styles.
	init(page: NativeViewPayload, params: [NativeRouteParam], store: NativeStore, style: StyleExport?, fonts: [String: Data]) throws {
		payload = page
		self.style = style
		self.fonts = fonts
		self.store = store
		runtime = NativeRuntime(payload: page, store: store, params: params)
		super.init(nibName: nil, bundle: nil)
		try buildPage()
		followsAppearance()
	}

	/// UIKit updates a covered screen's traits before it shows again, so every screen on the stack follows the appearance.
	private func followsAppearance() {
		registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (self: MarklessViewController, _: UITraitCollection) in
			self.applyBand()
		}
	}

	private func applyBand() {
		guard let bands = layout?.bands, let band else { return }
		do {
			let now = try bands.band(dark: traitCollection.userInterfaceStyle == .dark)
			guard now != band else { return }
			try tree?.apply([.state(cell: StyleBands.state, value: .number(Double(now)))])
			self.band = now
			paintCanvas()
		} catch {
			fatalError("Markless iOS host: \(error)")
		}
	}

	/// The `-route <path>` launch argument (Maestro's `launchApp: arguments: { route: ... }`).
	public nonisolated static func launchRoute() -> String? {
		let arguments = ProcessInfo.processInfo.arguments
		guard let index = arguments.firstIndex(of: "-route"), index + 1 < arguments.count else { return nil }
		return arguments[index + 1]
	}

	private func buildPage() throws {
		let dark = traitCollection.userInterfaceStyle == .dark
		layout = try style.map { try $0.resolve(for: payload, initialTexts: try runtime.texts(), value: runtime.value(of:), dark: dark) }
		band = try layout?.bands?.band(dark: dark)
		let faces = try registerFaces(layout?.fontFiles ?? [], fonts: fonts)
		tree = try ViewTree(runtime: runtime, layout: layout, faces: faces) { [weak self] action in
			self?.perform(action)
		}
		navigationItem.title = try runtime.title()
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("MarklessViewController is created from a payload") }

	public override func loadView() {
		view = UIView()
		paintCanvas()
		tree?.mount(in: view)
	}

	/// A styled page shows its canvas behind the page and the bars, as a browser does; an unstyled one the system background.
	private func paintCanvas() {
		guard isViewLoaded else { return }
		view.backgroundColor = tree?.canvas ?? .systemBackground
	}

	public override func viewIsAppearing(_ animated: Bool) {
		super.viewIsAppearing(animated)
		if let layout, abs(traitCollection.displayScale - layout.dpr) > 0.001 {
			fatalError("Markless iOS host: the style export was laid out at \(layout.dpr)x, this screen is \(traitCollection.displayScale)x")
		}
		applyBand()
		var pops = [navigationController?.interactivePopGestureRecognizer]
		if #available(iOS 26, *) { pops.append(navigationController?.interactiveContentPopGestureRecognizer) }
		for pop in pops.compactMap({ $0 }) {
			for gesture in tree?.dismissGestures ?? [] { gesture.require(toFail: pop) }
		}
	}

	/// Runs the handler for an action and applies its journal, exactly as a tap does.
	public func perform(_ action: NativeAction) {
		do {
			var journal = try runtime.dispatch(action)
			if case let .navigate(route, params, replace)? = journal.last {
				if let navigator { try navigator(route, params, replace) } else { try navigate(route, params) }
				return
			}
			if case let .title(value)? = journal.last {
				navigationItem.title = value
				journal.removeLast()
			}
			try tree?.apply(journal)
			paintCanvas()
		} catch {
			fatalError("Markless iOS host: \(error)")
		}
	}

	/// Builds the page at `route` from scratch with `params`; its state starts over.
	private func navigate(_ route: String, _ params: [NativeRouteParam]) throws {
		guard payload.route?.pattern == route else { throw HostError("no page for \(route): this payload is \(payload.route?.pattern ?? "not a page")") }
		runtime = NativeRuntime(payload: payload, store: store, params: params)
		tree?.root.removeFromSuperview()
		try buildPage()
		paintCanvas()
		if isViewLoaded { tree?.mount(in: view) }
	}
}

private func registerFaces(_ files: [(id: String, file: String)], fonts: [String: Data]) throws -> [String: UIFontDescriptor] {
	var faces: [String: UIFontDescriptor] = [:]
	for (id, file) in files {
		guard let bytes = fonts[id] else { throw HostError("the style export needs font \(id) (\(file)), which was not given") }
		let digest = "sha256:" + SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
		guard digest == id else { throw HostError("font bytes given for \(id) hash to \(digest)") }
		guard let descriptor = CTFontManagerCreateFontDescriptorFromData(bytes as CFData) else {
			throw HostError("font \(id) (\(file)) is not a font file")
		}
		faces[id] = descriptor as UIFontDescriptor
	}
	return faces
}

struct HostError: Error, CustomStringConvertible {
	let description: String
	init(_ description: String) { self.description = description }
}
#endif
