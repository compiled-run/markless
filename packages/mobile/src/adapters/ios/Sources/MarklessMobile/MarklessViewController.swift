#if canImport(UIKit)
import CryptoKit
import Foundation
import MarklessCore
import UIKit

/// Shows one compiled Markless component as retained UIKit views and runs its handlers as data.
///
/// - `payload`: the compiler's `markless.native-view/0` JSON.
/// - `style`: Dragon's `dragon.native-style-export/0` JSON; without it children stack vertically in the system font.
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
	private let device: NativeDevice
	private var runtime: NativeRuntime
	private var layout: StyleLayout?
	private(set) var tree: ViewTree?

	/// `route`: the path a page opens at, matched against the payload's route; by default the `-route` launch argument.
	public init(
		payload: Data, style: Data? = nil, fonts: [String: Data] = [:], store: NativeStore = UserDefaultsStore(),
		device: NativeDevice? = nil, route: String? = MarklessViewController.launchRoute()
	) throws {
		self.device = device ?? PlatformDevice()
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
		for cell in self.payload.cells {
			guard let name = cell.device else { continue }
			try self.device.watch(name, object: cell.object) { [weak self] value in
				guard let self else { return }
				self.apply { try self.runtime.device(cell.id, value) }
			}
		}
	}

	/// The `-route <path>` launch argument (Maestro's `launchApp: arguments: { route: ... }`).
	public nonisolated static func launchRoute() -> String? {
		let arguments = ProcessInfo.processInfo.arguments
		guard let index = arguments.firstIndex(of: "-route"), index + 1 < arguments.count else { return nil }
		return arguments[index + 1]
	}

	/// Fills the device cells from the device, then builds the views and starts the page's async device calls.
	private func buildPage() throws {
		for cell in payload.cells {
			if let name = cell.device { _ = try runtime.device(cell.id, try device.read(name, object: cell.object)) }
		}
		layout = try style.map { try $0.resolve(for: payload, initialTexts: try runtime.texts(), value: runtime.value(of:)) }
		let faces = try registerFaces(layout?.fontFiles ?? [], fonts: fonts)
		let device = self.device
		tree = try ViewTree(
			runtime: runtime, layout: layout, faces: faces, onAction: { [weak self] action in self?.perform(action) },
			objectView: { object, kind in try device.view(for: object, device: kind) })
		try runCalls(try runtime.tasks())
	}

	/// Hands `call` entries to the device; a call with a result settles its task cell when the device answers.
	private func runCalls(_ calls: [NativeJournalEntry]) throws {
		for case let .call(name, object, arguments, result, resume) in calls {
			let runtime = self.runtime
			let answer: (@MainActor (DeviceOutcome) -> Void)?
			if let cell = result {
				answer = { [weak self] outcome in
					guard let self, self.runtime === runtime else { return }
					self.apply {
						switch outcome {
						case let .value(value): return try runtime.settle(cell, value: value)
						case let .error(name, message): return try runtime.settle(cell, errorName: name, message: message)
						}
					}
				}
			} else if let continuation = resume {
				// An awaited call from a handler: the rest of the handler runs with the answer; a refusal ends it.
				answer = { [weak self] outcome in
					guard let self, self.runtime === runtime, case let .value(value) = outcome else { return }
					self.apply { try runtime.resume(continuation, value: value) }
				}
			} else {
				answer = nil
			}
			try device.call(name, object: object, arguments, settle: answer)
		}
	}

	private func apply(_ journalOf: () throws -> [NativeJournalEntry]) {
		do {
			let journal = try journalOf()
			try tree?.apply(journal.filter { if case .call = $0 { false } else { true } })
			try runCalls(journal)
		} catch {
			fatalError("Markless iOS host: \(error)")
		}
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("MarklessViewController is created from a payload") }

	public override func loadView() {
		let screen = UIView()
		screen.backgroundColor = .systemBackground
		view = screen
		tree?.mount(in: screen)
	}

	public override func viewIsAppearing(_ animated: Bool) {
		super.viewIsAppearing(animated)
		if let layout, abs(traitCollection.displayScale - layout.dpr) > 0.001 {
			fatalError("Markless iOS host: the style export was laid out at \(layout.dpr)x, this screen is \(traitCollection.displayScale)x")
		}
	}

	/// Runs the handler for an action and applies its journal, exactly as a tap does.
	public func perform(_ action: NativeAction) {
		do {
			let journal = try runtime.dispatch(action)
			if case let .navigate(route, params)? = journal.last {
				try navigate(route, params)
			} else {
				try tree?.apply(journal.filter { if case .call = $0 { false } else { true } })
				try runCalls(journal)
			}
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

public struct HostError: Error, CustomStringConvertible {
	public let description: String
	public init(_ description: String) { self.description = description }
}
#endif
