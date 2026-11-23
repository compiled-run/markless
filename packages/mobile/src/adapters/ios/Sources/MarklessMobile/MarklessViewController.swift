#if canImport(UIKit)
import CryptoKit
import Foundation
import MarklessCore
import UIKit
#if canImport(DragonPlan)
import DragonPlan
#endif

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
	/// The page area in points and the slot values the views were last laid out for by Dragon's plan; nil until then.
	private var laidOutFor: (size: CGSize, slots: [Double], texts: [String: String])?
	/// Each style slot's current number, by slot id: what Dragon's plan lays the page out with.
	private var slotValues: [String: Double] = [:]
	/// The texts at mount, which the style export laid out: a later layout checks the export against them, not the texts now.
	private var mountTexts: [(node: String, text: String)] = []
	/// How long the last layout at the screen's size took, in milliseconds (Dragon's layout of every assignment and the views' move).
	private var layoutMilliseconds: Double?
	private let fonts: [String: Data]
	private let images: [String: NativeImageAsset]
	private let store: NativeStore
	private let device: NativeDevice
	private var runtime: NativeRuntime
	private var layout: StyleLayout?
	/// The page's transitions and animations run by Dragon's animator, and the display link that moves them while they run.
	private var animation: AnimationRun?
	private var animationLink: CADisplayLink?
	private var animationLast: CFTimeInterval?
	/// The `@media` band the views show, and the bands it is picked from; nil without bands.
	private var band: Int?
	private var bands: StyleBands?
	private(set) var tree: ViewTree?
	/// Set once the page's first frame is on screen: `idle` and `visible` wait for it, as the web waits for load.
	private var appeared = false
	/// The one-shot run-loop observer that raises `idle` when the main run loop next goes idle.
	private var idleObserver: CFRunLoopObserver?
	private var raisingVisible = false
	/// Scroll views around a due `visible` element: each scroll looks again.
	private var scrollWatches: [ObjectIdentifier: NSKeyValueObservation] = [:]
	/// This screen's in-flight script requests: the request id the script gave, to the token that cancels it.
	private var requests: [Int: Int] = [:]
	/// In an app: opens the page a `navigate` entry names, pushed or in this screen's place.
	var navigator: ((_ route: String, _ params: [NativeRouteParam], _ replace: Bool) throws -> Void)?

	/// `route`: the path a page opens at, matched against the payload's route; by default the `-route` launch argument.
	public init(
		payload: Data, style: Data? = nil, fonts: [String: Data] = [:], images: [String: NativeImageAsset] = [:], store: NativeStore = UserDefaultsStore(),
		device: NativeDevice? = nil, route: String? = MarklessViewController.launchRoute()
	) throws {
		FirstFrame.controllerCreated()
		self.device = device ?? PlatformDevice()
		self.payload = try NativeViewPayload.decode(payload)
		self.style = try style.map { try StyleExport.decode($0) }
		if let reason = self.style?.notReady { NSLog("Markless iOS host: applying a style export Dragon marks analysis-only: %@", reason) }
		self.fonts = fonts
		self.images = images
		self.store = store
		var params: [NativeRouteParam] = []
		if let route {
			guard let page = self.payload.route else { throw HostError("opened at \(route), but \(self.payload.component) is not a page") }
			guard let matched = page.match(route) else { throw HostError("\(route) does not match the page's route \(page.pattern)") }
			params = matched
		} else if let page = self.payload.route, !page.params.isEmpty {
			throw HostError("\(page.pattern) needs a route to open at, and none was given")
		}
		runtime = NativeRuntime(
			payload: self.payload, store: store, params: params, preferredLanguages: Locale.preferredLanguages, scriptHost: MarklessScripting.shared.host)
		super.init(nibName: nil, bundle: nil)
		Self.linkDragon()
		try buildPage()
		try watchDevice()
		followsAppearance()
	}

	/// Dragon's band lookup, when the host links Dragon's translated harness.
	private static func linkDragon() {
		#if canImport(DragonPlan)
		StyleBands.library = DragonPlan.library
		RuntimeImagePaint.engine = { fit, position, content, width, height, zoom in
			let r = try DragonPlan.runtimeImagePaint(
				fit: fit, position: position.map { ($0.percent, $0.value) }, content: [content.x, content.y, content.width, content.height],
				width: width, height: height, zoom: zoom)
			let frame = { (at: Int) in Frame(x: r[at], y: r[at + 1], width: r[at + 2], height: r[at + 3]) }
			return (frame(0), frame(4), r[8].isNaN ? nil : frame(8))
		}
		#endif
	}

	/// One screen of an app: the page for a route, opened with its params and its route's styles.
	init(
		page: NativeViewPayload, params: [NativeRouteParam], store: NativeStore, style: StyleExport?, fonts: [String: Data], images: [String: NativeImageAsset] = [:],
		device: NativeDevice
	) throws {
		FirstFrame.controllerCreated()
		self.device = device
		payload = page
		self.style = style
		self.fonts = fonts
		self.images = images
		self.store = store
		runtime = NativeRuntime(payload: page, store: store, params: params, scriptHost: MarklessScripting.shared.host)
		super.init(nibName: nil, bundle: nil)
		Self.linkDragon()
		try buildPage()
		try watchDevice()
		followsAppearance()
	}

	/// UIKit updates a covered screen's traits before it shows again, so every screen on the stack follows the appearance.
	private func followsAppearance() {
		registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (self: MarklessViewController, _: UITraitCollection) in
			self.applyBand()
		}
	}

	private func applyBand() {
		guard let bands, let band else { return }
		do {
			let now = try bandNow(bands)
			guard now != band else { return }
			try tree?.apply([.state(cell: StyleBands.state, value: .number(Double(now)))])
			self.band = now
			paintCanvas()
		} catch {
			hostFailed("\(error)")
		}
	}

	/// The band of the page as it is shown: its laid-out page area once Dragon's plan has laid it out, else the export's.
	private func bandNow(_ bands: StyleBands) throws -> Int {
		let dark = traitCollection.userInterfaceStyle == .dark
		guard let layout else { return try bands.band(dark: dark) }
		return try bands.band(dark: dark, widthPx: layout.viewport.width * layout.dpr, heightPx: layout.viewport.height * layout.dpr, scale: layout.dpr)
	}

	/// Live device values reach the page's device cells as they change.
	private func watchDevice() throws {
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
		runtime.measure = { [weak self] id in self?.measureBox(id) }
		// Safari reports the screen's scale as devicePixelRatio.
		runtime.devicePixelRatio = { [weak self] in Double(self?.traitCollection.displayScale ?? 1) }
		runtime.media = { [weak self] in
			[
				("prefers-reduced-motion", UIAccessibility.isReduceMotionEnabled ? "reduce" : "no-preference"),
				("prefers-color-scheme", self?.traitCollection.userInterfaceStyle == .dark ? "dark" : "light"),
			]
		}
		#if !canImport(DragonPlan)
		if let style, !style.slots.isEmpty {
			throw HostError("style values that follow state need Dragon's layout plan, which this host does not link")
		}
		#endif
		for cell in payload.cells {
			if let name = cell.device { _ = try runtime.device(cell.id, try device.read(name, object: cell.object)) }
		}
		slotValues = Dictionary(try runtime.slots().map { ($0.slot, $0.value) }, uniquingKeysWith: { $1 })
		let dark = traitCollection.userInterfaceStyle == .dark
		let texts = try runtime.texts()
		mountTexts = texts
		// With Dragon's plan the page's first layout lays out the texts it shows now, which the build could not know (stored data,
		// the route's params); without one each text must be the one the build laid out.
		#if canImport(DragonPlan)
		let checked = style?.plan == nil ? texts : []
		#else
		let checked = texts
		#endif
		layout = try style.map { try $0.resolve(for: payload, initialTexts: checked, value: runtime.value(of:), arm: runtime.styleArm(of:), dark: dark) }
		var sheetLayouts: [String: [(snapPoint: Double, layout: StyleLayout)]] = [:]
		for sheet in style?.sheets ?? [] {
			sheetLayouts[sheet.node] = try style!.resolveSheet(sheet.node, for: payload, initialTexts: texts, value: runtime.value(of:), arm: runtime.styleArm(of:), dark: dark)
		}
		bands = layout?.bands ?? sheetLayouts.values.joined().lazy.compactMap(\.layout.bands).first
		band = try bands.map(bandNow)
		let systemFaces = sheetLayouts.values.joined().reduce(layout?.systemFaces ?? [:]) { $0.merging($1.layout.systemFaces) { a, _ in a } }
		let faces = try registerFaces(layout?.fontFiles ?? [], fonts: fonts).merging(systemFaces.mapValues { systemFont($0, size: 17) as UIFont }.mapValues(\.fontDescriptor)) { a, _ in a }
		let device = self.device
		tree = try ViewTree(
			runtime: runtime, layout: layout, sheetLayouts: sheetLayouts, faces: faces,
			onAction: { [weak self] action in _ = self?.perform(action) },
			ask: { [weak self] action in self?.perform(action) ?? false },
			objectView: { object, kind in try device.view(for: object, device: kind) }, images: images)
		tree?.presenter = self
		#if canImport(DragonPlan)
		if let style, style.anim != nil, let tree {
			animation = AnimationRun(style: style, initial: tree.assignment, run: DragonPlan.animation)
		}
		#endif
		navigationItem.title = try runtime.title()
		try runCalls(try runtime.tasks())
		apply { try self.runtime.start() }
	}

	/// The screen is gone: the requests of its async values are cancelled and their responses never arrive.
	private func leave() {
		do {
			try runCalls(try runtime.leave())
		} catch {
			hostFailed("\(error)")
		}
	}

	public override func didMove(toParent parent: UIViewController?) {
		super.didMove(toParent: parent)
		if parent == nil { leave() }
	}

	/// Hands `release` and `call` entries to the device (a call with a result settles its task cell when the device answers),
	/// and a script's requests to the app's script services, answering this screen's runtime.
	private func runCalls(_ journal: [NativeJournalEntry]) throws {
		for entry in journal {
			if case let .release(object) = entry { device.release(object) }
			if case let .abort(id) = entry, let token = requests.removeValue(forKey: id) { MarklessScripting.shared.cancel(token) }
			if case let .fetch(id, request) = entry {
				let runtime = self.runtime
				requests[id] = MarklessScripting.shared.fetch(request) { [weak self] response in
					guard let self else { return }
					self.requests[id] = nil
					guard self.runtime === runtime else { return }
					self.apply { try runtime.response(id, response) }
				}
			}
			guard case let .call(name, object, arguments, result, resume) = entry else { continue }
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
				answer = { [weak self] outcome in
					guard let self, self.runtime === runtime else { return }
					self.apply {
						switch outcome {
						case let .value(value): return try runtime.resume(continuation, value: value)
						case let .error(name, message): return try runtime.reject(continuation, name: name, message: message)
						}
					}
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
			for case let .title(value) in journal { navigationItem.title = value }
			try tree?.apply(journal.filter(\.isForViews))
			followSlots(journal)
			if movesRows(journal) { layOutAtScreenSize(rowsMoved: true) }
			try runCalls(journal)
			if let tree { animation?.moved(to: tree.assignment) }
		} catch {
			hostFailed("\(error)")
		}
		runAnimation()
		writeLayoutDump()
		tree?.presenter = self
		scheduleLoadEvents()
	}

	/// Runs Dragon's animator up to now: dispatches each animation event a handler listens for, and keeps the display link
	/// running while an animation or transition does.
	private func runAnimation() {
		guard let animation else { return }
		let size = view.safeAreaLayoutGuide.layoutFrame.size
		guard size.width > 0, size.height > 0 else { return }
		let next: (events: [AnimationEvent], busy: Bool)
		do {
			next = try animation.next(dpr: Double(traitCollection.displayScale), width: Double(size.width), height: Double(size.height))
		} catch {
			hostFailed("\(error)")
		}
		if next.busy, animationLink == nil {
			let link = CADisplayLink(target: self, selector: #selector(animationFrame(_:)))
			link.add(to: .main, forMode: .common)
			animationLink = link
		} else if !next.busy {
			animationLink?.invalidate()
			animationLink = nil
			animationLast = nil
		}
		for event in next.events {
			let host = event.node.firstIndex(of: "@").map { String(event.node[..<$0]) } ?? event.node
			guard payload.events.contains(where: { $0.host == host && $0.event == event.event }) else { continue }
			apply { try self.runtime.dispatch(NativeAction(event: event.event, host: event.node, value: event.name, time: event.elapsedTime)) }
		}
	}

	@objc private func animationFrame(_ link: CADisplayLink) {
		if let last = animationLast { animation?.advanced(ms: (link.timestamp - last) * 1000) }
		animationLast = link.timestamp
		runAnimation()
	}

	/// After the first frame and after every journal: `idle` for the elements due one, `visible` for those on screen.
	private func scheduleLoadEvents() {
		guard appeared else { return }
		if idleObserver == nil, !((try? runtime.due(.idle)) ?? []).isEmpty {
			let observer = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.beforeWaiting.rawValue, false, 0) { [weak self] _, _ in
				MainActor.assumeIsolated { self?.raiseIdle() }
			}
			CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes)
			idleObserver = observer
		}
		raiseVisible()
	}

	private func raiseIdle() {
		if let idleObserver { CFRunLoopRemoveObserver(CFRunLoopGetMain(), idleObserver, .commonModes) }
		idleObserver = nil
		for host in (try? runtime.due(.idle)) ?? [] { perform(NativeAction(event: .idle, host: host)) }
	}

	/// An element's box in points from the top left of the page's part of the screen, as `getBoundingClientRect()` gives
	/// it in CSS pixels; nil when it has no view on screen.
	private func measureBox(_ id: String) -> NativeElementBox? {
		guard let element = tree?.elements[id], element.window != nil else { return nil }
		let page = view.safeAreaLayoutGuide.layoutFrame
		let box = element.convert(element.bounds, to: view)
		return NativeElementBox(
			x: box.minX - page.minX, y: box.minY - page.minY, width: box.width, height: box.height,
			rightToLeft: element.effectiveUserInterfaceLayoutDirection == .rightToLeft)
	}

	/// Raises `visible` for each element due one that has any of its box inside the page's part of the screen.
	private func raiseVisible() {
		guard appeared, !raisingVisible, let tree, viewIfLoaded?.window != nil else { return }
		raisingVisible = true
		defer { raisingVisible = false }
		view.layoutIfNeeded()
		let screen = view.safeAreaLayoutGuide.layoutFrame
		for host in (try? runtime.due(.visible)) ?? [] {
			guard let element = tree.elements[host] else { continue }
			if tree.isOnScreen(element, within: screen, of: view) {
				perform(NativeAction(event: .visible, host: host))
				continue
			}
			var ancestor = element.superview
			while let candidate = ancestor {
				if let scroll = candidate as? UIScrollView, scrollWatches[ObjectIdentifier(scroll)] == nil {
					scrollWatches[ObjectIdentifier(scroll)] = scroll.observe(\.contentOffset) { [weak self] _, _ in
						MainActor.assumeIsolated { self?.raiseVisible() }
					}
				}
				ancestor = candidate.superview
			}
		}
	}

	public override func viewDidLayoutSubviews() {
		super.viewDidLayoutSubviews()
		layOutAtScreenSize()
		if view.window != nil { FirstFrame.laidOut() }
		raiseVisible()
	}

	/// With Dragon's plan, the page lays out at the size it is shown at, as a browser does: on first show, after a rotation and
	/// whenever the window changes size. The page area is the safe area, which the page scroll view keeps its content inside.
	/// Whether a journal changed what a styled list's rows lay out: its rows, a row's text or an attribute of a row's copy.
	private func movesRows(_ journal: [NativeJournalEntry]) -> Bool {
		guard let style, !style.planRepeats.isEmpty else { return false }
		return journal.contains { entry in
			switch entry {
			// An arm that opens may hold a list whose rows are laid out only once it shows.
			case .rows, .arm: return true
			case let .text(node, _), let .attribute(node, _, _): return node.contains("@")
			default: return false
			}
		}
	}

	private func layOutAtScreenSize(rowsMoved: Bool = false) {
		#if canImport(DragonPlan)
		guard let style, style.plan != nil, let tree else { return }
		let size = view.safeAreaLayoutGuide.layoutFrame.size
		let started = CFAbsoluteTimeGetCurrent()
		do {
			let slots = try style.slots.map { slot in
				// A slot inside a row has a value per row copy, which the rows carry; the page lays its template out at the first value.
				guard let value = slotValues[slot.id] ?? (isRowSlot(slot.id) ? slot.initial : nil) else { throw HostError("the style export lays out slot \(slot.id), which the payload does not compute") }
				return value
			}
			let pageRows = Dictionary(payload.nodes.map { ($0.id, $0.row) }, uniquingKeysWith: { a, _ in a })
			let texts = Dictionary(try runtime.texts().filter { pageRows[$0.node] != nil && pageRows[$0.node]! == nil }.map { ($0.node, $0.text) }, uniquingKeysWith: { a, _ in a })
			guard size.width > 0, size.height > 0, rowsMoved || size != laidOutFor?.size || slots.map(\.bitPattern) != laidOutFor?.slots.map(\.bitPattern) || texts != laidOutFor?.texts else { return }
			let scale = Double(traitCollection.displayScale)
			let shaper = coreTextRowShaper(faces: style.systemFaces, authored: fonts, dpr: scale)
			var unshaped = false
			let shape: (String, Double, String, Int, Int, String, [Double]) throws -> [Double] = { face, size, text, start, end, language, features in
				if style.systemFaces[face] == nil && self.fonts[face] == nil { unshaped = true }
				return try shaper(face, size, text, start, end, language, features)
			}
			let rows = style.planRepeats.isEmpty ? nil : try style.shownRows(payload, runtime: runtime)
			let lay = { (texts: [String: String]) in
				try style.laidOut(
					width: Double(size.width), height: Double(size.height), scale: scale, slots: slots, layout: DragonPlan.layout,
					rows: rows, rowsLayout: { DragonPlan.rowsLayout($0, shape: shape) }, texts: texts)
			}
			// Page texts in a face this host cannot shape keep the boxes the build laid them out in, as before they followed state.
			let relaid: StyleExport
			// The layout holds the texts the page shows now, unless it kept the build's boxes.
			var laidTexts = try runtime.texts()
			do { relaid = try lay(texts) } catch where unshaped && !texts.isEmpty {
				relaid = try lay([:])
				laidTexts = mountTexts
			}
			let now = try relaid.resolve(
				for: payload, initialTexts: laidTexts, value: runtime.value(of:), dark: traitCollection.userInterfaceStyle == .dark)
			try tree.relayout(now)
			layout = now
			laidOutFor = (size, slots, texts)
			applyBand()
			layoutMilliseconds = (CFAbsoluteTimeGetCurrent() - started) * 1000
		} catch {
			hostFailed("\(error)")
		}
		#endif
		writeLayoutDump()
	}

	/// A `slot` entry's value, or a page text's change, lays the page out again at its current size, once the rest of the journal is applied.
	private func followSlots(_ journal: [NativeJournalEntry]) {
		var moved = false
		var rowMoved = false
		for case let .slot(slot, value) in journal {
			slotValues[slot] = value
			moved = true
			if slot.contains("@") { rowMoved = true }
		}
		// A page text that changes, or one an arm shows, may change its box: the layout compares the texts it last laid out with.
		for case let .text(node, _) in journal where !node.contains("@") { moved = true }
		for case let .arm(node, _) in journal where !node.contains("@") { moved = true }
		if moved, isViewLoaded { layOutAtScreenSize(rowsMoved: rowMoved) }
	}

	private func isRowSlot(_ id: String) -> Bool { payload.slots.contains { $0.id == id && $0.row != nil } }

	/// With the launch argument `-markless-layout-dump`, every shown box in points from the page's top left, written to
	/// Documents/markless-layout.json after each layout and each journal, for a check against the phone's browser.
	private func writeLayoutDump() {
		guard ProcessInfo.processInfo.arguments.contains("-markless-layout-dump"), let tree, view.window != nil else { return }
		let size = view.safeAreaLayoutGuide.layoutFrame.size
		let number = { (v: CGFloat) in JSONValue.number(Double(v)) }
		let dump = JSONValue.object([
			("component", .string(payload.component)),
			("viewport", .object([("width", number(size.width)), ("height", number(size.height))])),
			("scale", number(traitCollection.displayScale)),
			("assignment", .number(Double(tree.assignment))),
			("layoutMilliseconds", layoutMilliseconds.map { .number($0) } ?? .null),
			("nodes", .array(tree.shownFrames().map { node in
				.array([.string(node.id), number(node.frame.minX), number(node.frame.minY), number(node.frame.width), number(node.frame.height)])
			})),
		])
		guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
		try? Data(dump.jsonText.utf8).write(to: documents.appendingPathComponent("markless-layout.json"), options: .atomic)
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

	public override func viewDidLoad() {
		super.viewDidLoad()
		// As a phone browser does once the keyboard is up: the focused field is scrolled into what the keyboard leaves shown.
		NotificationCenter.default.addObserver(forName: UIResponder.keyboardDidShowNotification, object: nil, queue: .main) { [weak self] _ in
			MainActor.assumeIsolated { self?.revealFocusedField() }
		}
	}

	private func revealFocusedField() {
		guard let tree, let field = tree.focusedField else { return }
		tree.bringIntoView(field, block: focusIntoViewAlign.block, inline: focusIntoViewAlign.inline)
	}

	public override func viewIsAppearing(_ animated: Bool) {
		super.viewIsAppearing(animated)
		if let layout, style?.plan == nil, abs(traitCollection.displayScale - layout.dpr) > 0.001 {
			hostFailed("the style export was laid out at \(layout.dpr)x, this screen is \(traitCollection.displayScale)x")
		}
		applyBand()
		var pops = [navigationController?.interactivePopGestureRecognizer]
		// The content swipe-back is iOS 26 API: Swift 6.2 (Xcode 26) is the first toolchain whose SDK declares it.
		#if compiler(>=6.2)
		if #available(iOS 26, *) { pops.append(navigationController?.interactiveContentPopGestureRecognizer) }
		#endif
		for pop in pops.compactMap({ $0 }) {
			for gesture in tree?.dismissGestures ?? [] { gesture.require(toFail: pop) }
		}
	}

	/// Shown again after Back: the app-wide and storage cells a page above changed reach this page before it slides in.
	public override func viewWillAppear(_ animated: Bool) {
		super.viewWillAppear(animated)
		if tree != nil { apply { try runtime.resume() } }
	}

	public override func viewDidAppear(_ animated: Bool) {
		super.viewDidAppear(animated)
		tree?.pageAppeared(self)
		appeared = true
		scheduleLoadEvents()
		if let script = payload.script { MarklessScripting.shared.warm(script) }
	}

	/// Runs the handler for an action and applies its journal, exactly as a tap does; answers whether it called `preventDefault()`.
	@discardableResult public func perform(_ action: NativeAction) -> Bool {
		tree?.dismissMessage()
		var prevented = false
		do {
			let journal = try runtime.dispatch(action)
			if case let .navigate(route, params, replace)? = journal.last {
				if replace || navigator == nil { leave() }
				if let navigator { try navigator(route, params, replace) } else { try navigate(route, params) }
				return false
			}
			prevented = journal.contains(.preventDefault)
			for case let .title(value) in journal { navigationItem.title = value }
			try tree?.apply(journal.filter(\.isForViews))
			followSlots(journal)
			if movesRows(journal) { layOutAtScreenSize(rowsMoved: true) }
			try runCalls(journal)
			paintCanvas()
			if let tree { animation?.moved(to: tree.assignment) }
		} catch {
			hostFailed("\(error)")
		}
		runAnimation()
		scheduleLoadEvents()
		return prevented
	}

	/// Builds the page at `route` from scratch with `params`; its state starts over.
	private func navigate(_ route: String, _ params: [NativeRouteParam]) throws {
		guard payload.route?.pattern == route else { throw HostError("no page for \(route): this payload is \(payload.route?.pattern ?? "not a page")") }
		for object in payload.objects { device.release(object.id) }
		runtime = NativeRuntime(
			payload: payload, store: store, params: params, preferredLanguages: Locale.preferredLanguages, scriptHost: MarklessScripting.shared.host)
		scrollWatches = [:]
		tree?.unmount()
		try buildPage()
		paintCanvas()
		if isViewLoaded { tree?.mount(in: view) }
		if viewIfLoaded?.window != nil { tree?.pageAppeared(self) }
		scheduleLoadEvents()
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

extension NativeJournalEntry {
	/// Every entry but the ones the page's device runs and the title, which the screen's navigation bar shows.
	var isForViews: Bool {
		switch self {
		case .call, .release, .title, .fetch, .preventDefault, .abort, .slot: false
		default: true
		}
	}
}

public struct HostError: Error, CustomStringConvertible {
	public let description: String
	public init(_ description: String) { self.description = description }
}
#endif
