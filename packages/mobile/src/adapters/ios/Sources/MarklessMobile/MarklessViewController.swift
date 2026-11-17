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
	private var runtime: NativeRuntime
	private var layout: StyleLayout?
	private(set) var tree: ViewTree?

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
		runtime = NativeRuntime(payload: self.payload, store: store, params: params, startEngine: MarklessViewController.startEngine)
		super.init(nibName: nil, bundle: nil)
		try buildPage()
	}

	/// Proof only: starts JavaScriptCore for `script` ops and logs what it cost.
	nonisolated static func startEngine(_ source: String) throws -> NativeScriptEngine {
		let footprint = memoryFootprint()
		let started = DispatchTime.now()
		let engine = try JavaScriptCoreEngine(source: source)
		let ms = Double(DispatchTime.now().uptimeNanoseconds - started.uptimeNanoseconds) / 1e6
		NSLog("MarklessEngine engine javascriptcore started in %.2f ms, footprint +%lld KiB, script %d chars", ms, (memoryFootprint() - footprint) / 1024, source.count)
		return engine
	}

	/// Proof only: true once the first dispatch that ran a script has been timed.
	private var timedFirstScript = false

	/// The `-route <path>` launch argument (Maestro's `launchApp: arguments: { route: ... }`).
	public nonisolated static func launchRoute() -> String? {
		let arguments = ProcessInfo.processInfo.arguments
		guard let index = arguments.firstIndex(of: "-route"), index + 1 < arguments.count else { return nil }
		return arguments[index + 1]
	}

	private func buildPage() throws {
		layout = try style.map { try $0.resolve(for: payload, initialTexts: try runtime.texts(), value: runtime.value(of:)) }
		let faces = try registerFaces(layout?.fontFiles ?? [], fonts: fonts)
		tree = try ViewTree(runtime: runtime, layout: layout, faces: faces) { [weak self] action in
			self?.perform(action)
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
		timed("tap \(action.host)") { try runtime.dispatch(action) }
	}

	/// Runs a dispatch, applies its journal (scheduling the timers it names) and logs how long it took.
	private func timed(_ what: String, _ run: () throws -> [NativeJournalEntry]) {
		let scripted = !timedFirstScript && payload.script != nil
		let started = DispatchTime.now()
		do {
			runtime.onScriptError = { error in NSLog("MarklessEngine %@", String(describing: error)) }
			let journal = try run()
			if case let .navigate(route, params)? = journal.last {
				try navigate(route, params)
			} else {
				try tree?.apply(journal.filter { if case .timer = $0 { return false } else { return true } })
				for case let .timer(id, ms) in journal {
					DispatchQueue.main.asyncAfter(deadline: .now() + ms / 1000) { [weak self] in
						guard let self else { return }
						self.timed("timer \(id)") { try self.runtime.fire(timer: id) }
					}
				}
			}
		} catch {
			fatalError("Markless iOS host: \(error)")
		}
		let ms = Double(DispatchTime.now().uptimeNanoseconds - started.uptimeNanoseconds) / 1e6
		let first = scripted && runtime.engineStarted
		NSLog("MarklessEngine %@ %.2f ms%@", what, ms, first ? " (first after the engine started)" : "")
		if first { timedFirstScript = true }
	}

	public override func viewDidAppear(_ animated: Bool) {
		super.viewDidAppear(animated)
		// Proof only: a build that asks for it starts the engine once the first frame is up and the run loop is idle.
		guard payload.script != nil, Bundle.main.url(forResource: "warm-engine", withExtension: nil, subdirectory: "markless") != nil else { return }
		RunLoop.main.perform(inModes: [.default]) { [weak self] in try? self?.runtime.warmEngine() }
	}

	/// Builds the page at `route` from scratch with `params`; its state starts over.
	private func navigate(_ route: String, _ params: [NativeRouteParam]) throws {
		guard payload.route?.pattern == route else { throw HostError("no page for \(route): this payload is \(payload.route?.pattern ?? "not a page")") }
		runtime = NativeRuntime(payload: payload, store: store, params: params, startEngine: MarklessViewController.startEngine)
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

/// The process's physical footprint, as the system counts it against the app's memory limit.
func memoryFootprint() -> Int64 {
	var info = task_vm_info_data_t()
	var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
	let result = withUnsafeMutablePointer(to: &info) {
		$0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) }
	}
	return result == KERN_SUCCESS ? Int64(info.phys_footprint) : 0
}

struct HostError: Error, CustomStringConvertible {
	let description: String
	init(_ description: String) { self.description = description }
}
#endif
