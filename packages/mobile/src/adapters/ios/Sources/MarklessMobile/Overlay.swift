#if canImport(UIKit)
import MarklessCore
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// The overlay stack on screen: a modal overlay's view is lifted into its own top layer above the page (the stacking
/// layout's card: centred, white, 16 pt padding), a non-modal one stays where its `hidden` binding shows it. Touches are
/// reported as `pointerdown`, `pointermove`, `pointerup` and `pointercancel`, and VoiceOver's escape gesture as a `dismiss` of
/// the topmost overlay.
@MainActor
final class OverlayHost {
	private let runtime: NativeRuntime
	private let root: UIView
	private let onAction: (NativeAction) -> Void
	/// The element instance id a view stands for, or nil when it is no element.
	private let nodeOf: (UIView) -> String?
	private let viewOf: (String) -> UIView?
	/// Lays a container's children out again after one leaves or returns (the stacking layout only).
	private let restack: (UIView) -> Void
	private let reportsTouches: Bool
	/// Whether a move can run a handler: without one the runtime hears only a touch's down, up and cancel.
	private let reportsMoves: Bool
	/// Where a touch reports when it lands on no element: the page's first root element, the body's stand-in.
	private let pageElement: String?
	private var lifted: [(node: String, layer: OverlayLayerView, home: UIView, index: Int, frame: CGRect?)] = []
	private var observer: PointerObserver?
	/// Each touch reported down and not yet up or cancelled: its pointer id, the scroll views it is in, its last place.
	private var active: [ObjectIdentifier: (pointerId: Int, scrolls: [ObjectIdentifier], point: CGPoint)] = [:]
	private var nextPointer = 1
	/// The system uptime touch times count from: when the page was mounted, then when its screen first appeared.
	private var origin: (time: TimeInterval, appeared: Bool) = (ProcessInfo.processInfo.systemUptime, false)
	/// The scroll views whose pan is watched, by identity.
	private var pans: [ObjectIdentifier: (scroll: UIScrollView, watch: PanWatch)] = [:]
	/// The screen the page is mounted in, where a modal overlay's top layer goes.
	private weak var screen: UIView?
	private var announce: (screen: Bool, focus: UIView?) = (false, nil)

	init(
		runtime: NativeRuntime, root: UIView, onAction: @escaping (NativeAction) -> Void, nodeOf: @escaping (UIView) -> String?,
		viewOf: @escaping (String) -> UIView?, restack: @escaping (UIView) -> Void
	) {
		self.runtime = runtime
		self.root = root
		self.onAction = onAction
		self.nodeOf = nodeOf
		self.viewOf = viewOf
		self.restack = restack
		let payload = runtime.payload
		reportsTouches = payload.nodes.contains { node in
			if case let .element(_, attributes, _) = node.kind { return attributes[OverlayProtocol.attribute] != nil }
			return false
		} || payload.events.contains { $0.event.isPointer } || payload.tapPoints
		reportsMoves = payload.events.contains { event in
			[.pointermove, .pointerover, .pointerout, .pointerenter, .pointerleave].contains(event.event)
		}
		pageElement = payload.nodes.first { $0.parent == nil && $0.isElement }?.id
	}

	static func isOverlay(_ attributes: [String: String]) -> Bool { attributes[OverlayProtocol.attribute] != nil }

	/// Watches the screen's touches and opens the overlays the runtime already shows.
	func mount(in screen: UIView) throws {
		self.screen = screen
		origin = (ProcessInfo.processInfo.systemUptime, false)
		if reportsTouches {
			let observer = PointerObserver { [weak self] event, touch in self?.report(event, touch) }
			screen.addGestureRecognizer(observer)
			self.observer = observer
		}
		for overlay in try runtime.overlays() { try open(overlay.node, modal: overlay.modal) }
		flush()
	}

	func open(_ node: String, modal: Bool) throws {
		guard modal else { return }
		guard let view = viewOf(node) else { throw HostError("journal opens overlay \(node), which is not shown") }
		guard !lifted.contains(where: { $0.node == node }) else { throw HostError("overlay \(node) is already in a top layer") }
		guard let screen, let home = view.superview, let index = home.subviews.firstIndex(of: view) else {
			throw HostError("overlay \(node) opened before the page was mounted")
		}
		let frame: CGRect? = view.translatesAutoresizingMaskIntoConstraints ? view.frame : nil
		view.removeFromSuperview()
		restack(home)
		let layer = OverlayLayerView(node: node)
		layer.onEscape = { [weak self] in self?.escape() ?? false }
		// Chrome's ::backdrop default, rgba(0, 0, 0, 0.1), as the dialog's top layer.
		layer.backgroundColor = UIColor(white: 0, alpha: 0.1)
		layer.accessibilityViewIsModal = true
		layer.translatesAutoresizingMaskIntoConstraints = false
		let card = OverlayCard()
		card.backgroundColor = .white
		card.translatesAutoresizingMaskIntoConstraints = false
		view.translatesAutoresizingMaskIntoConstraints = false
		screen.addSubview(layer)
		layer.addSubview(card)
		card.addSubview(view)
		let guide = layer.safeAreaLayoutGuide
		var constraints = [
			layer.topAnchor.constraint(equalTo: screen.topAnchor),
			layer.bottomAnchor.constraint(equalTo: screen.bottomAnchor),
			layer.leadingAnchor.constraint(equalTo: screen.leadingAnchor),
			layer.trailingAnchor.constraint(equalTo: screen.trailingAnchor),
			card.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
			card.centerYAnchor.constraint(equalTo: guide.centerYAnchor),
			card.widthAnchor.constraint(lessThanOrEqualTo: guide.widthAnchor, constant: -32),
			view.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
			view.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -16),
			view.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
			view.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
		]
		if let frame {
			constraints += [view.widthAnchor.constraint(equalToConstant: frame.width), view.heightAnchor.constraint(equalToConstant: frame.height)]
		}
		NSLayoutConstraint.activate(constraints)
		for below in lifted { below.layer.accessibilityElementsHidden = true }
		root.accessibilityElementsHidden = true
		lifted.append((node, layer, home, index, frame))
		announce.screen = true
		if announce.focus == nil { announce.focus = view }
	}

	func close(_ node: String) {
		guard let at = lifted.firstIndex(where: { $0.node == node }) else { return }
		let top = lifted.remove(at: at)
		let view = viewOf(node)
		view?.removeFromSuperview()
		top.layer.removeFromSuperview()
		if let view {
			if let frame = top.frame {
				view.translatesAutoresizingMaskIntoConstraints = true
				view.frame = frame
			}
			top.home.insertSubview(view, at: min(top.index, top.home.subviews.count))
			restack(top.home)
		}
		lifted.last?.layer.accessibilityElementsHidden = false
		root.accessibilityElementsHidden = !lifted.isEmpty
		announce.screen = true
	}

	func focus(_ node: String) throws {
		guard let view = viewOf(node) else { throw HostError("journal focuses \(node), which is not shown") }
		announce.focus = view
	}

	/// After a journal: VoiceOver moves to the focused element, or to the new screen when a top layer came or went.
	func flush() {
		defer { announce = (false, nil) }
		if announce.screen {
			UIAccessibility.post(notification: .screenChanged, argument: announce.focus)
		} else if let focus = announce.focus {
			UIAccessibility.post(notification: .layoutChanged, argument: focus)
		}
	}

	/// VoiceOver's escape gesture (two-finger scrub) on an overlay: reported to the topmost one, as Escape is on the web.
	func escape() -> Bool {
		guard let top = try? runtime.overlays().last else { return false }
		onAction(NativeAction(event: .dismiss, host: top.node, reason: "escape"))
		return true
	}

	var timeOrigin: TimeInterval { origin.time }

	/// The page's screen appeared: touch times count from the first time it did.
	func appeared() {
		guard !origin.appeared else { return }
		origin = (ProcessInfo.processInfo.systemUptime, true)
	}

	/// The page is taken off its screen: it stops hearing the screen's touches and its scroll views' pans.
	func unmount() {
		if let observer { observer.view?.removeGestureRecognizer(observer) }
		observer = nil
		for pan in pans.values { pan.scroll.panGestureRecognizer.removeTarget(pan.watch, action: #selector(PanWatch.changed(_:))) }
		pans = [:]
		active = [:]
	}

	private func report(_ event: NativeEventName, _ touch: UITouch) {
		guard let screen else { return }
		let point = touch.location(in: screen)
		let under = event == .pointerdown ? touch.view : screen.hitTest(point, with: nil)
		self.touch(event, ObjectIdentifier(touch), under: under, at: point, time: touch.timestamp)
	}

	/// One touch's report: `view` is the deepest view under it now, `point` its place in the screen, `time` its system uptime.
	func touch(_ event: NativeEventName, _ key: ObjectIdentifier, under view: UIView?, at point: CGPoint, time: TimeInterval) {
		let pointerId: Int
		switch event {
		case .pointerdown:
			guard active[key] == nil else { return }
			pointerId = nextPointer
			nextPointer += 1
			var scrolls: [ObjectIdentifier] = []
			var at = view
			while let current = at {
				if let scroll = current as? UIScrollView {
					scrolls.append(ObjectIdentifier(scroll))
					watch(scroll)
				}
				at = current.superview
			}
			active[key] = (pointerId, scrolls, point)
		case .pointermove:
			guard var moving = active[key] else { return }
			moving.point = point
			active[key] = moving
			guard reportsMoves else { return }
			pointerId = moving.pointerId
		default:
			guard let ended = active.removeValue(forKey: key) else { return }
			pointerId = ended.pointerId
		}
		var at = view
		var host: String?
		while let current = at, host == nil {
			host = nodeOf(current) ?? (current as? OverlayLayerView)?.node
			at = current.superview
		}
		guard let host = host ?? pageElement else { return }
		onAction(NativeAction(
			event: event, host: host, pointerId: Double(pointerId), x: Double(point.x), y: Double(point.y), time: (time - origin.time) * 1000))
	}

	private func watch(_ scroll: UIScrollView) {
		let id = ObjectIdentifier(scroll)
		guard pans[id] == nil else { return }
		let target = PanWatch { [weak self] pan in
			if pan.state == .began { self?.scrollBegan(id) }
		}
		scroll.panGestureRecognizer.addTarget(target, action: #selector(PanWatch.changed(_:)))
		pans[id] = (scroll, target)
	}

	/// A scroll view began scrolling: each touch in it is the platform's now, as Safari reports with `pointercancel`.
	func scrollBegan(_ scroll: ObjectIdentifier) {
		let now = ProcessInfo.processInfo.systemUptime
		for (key, touch) in active.sorted(by: { $0.value.pointerId < $1.value.pointerId }) where touch.scrolls.contains(scroll) {
			self.touch(.pointercancel, key, under: screen?.hitTest(touch.point, with: nil), at: touch.point, time: now)
		}
	}
}

/// The target of a scroll view's pan: its own recognizer is not cancelled by the pan, so the host watches the pan begin.
@MainActor
final class PanWatch: NSObject {
	private let onChange: (UIPanGestureRecognizer) -> Void
	init(_ onChange: @escaping (UIPanGestureRecognizer) -> Void) { self.onChange = onChange }
	@objc func changed(_ pan: UIPanGestureRecognizer) { onChange(pan) }
}

/// Hears every touch on the screen and never recognizes, so the controls under it work as before; it sees each touch before
/// the control does, so a `pointerup` reaches the runtime ahead of the button's own activation.
final class PointerObserver: UIGestureRecognizer {
	private let report: (NativeEventName, UITouch) -> Void

	init(report: @escaping (NativeEventName, UITouch) -> Void) {
		self.report = report
		super.init(target: nil, action: nil)
		cancelsTouchesInView = false
		delaysTouchesBegan = false
		delaysTouchesEnded = false
	}

	override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
		for touch in touches { report(.pointerdown, touch) }
	}

	override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
		for touch in touches { report(.pointermove, touch) }
	}

	override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
		for touch in touches { report(.pointerup, touch) }
		finishIfDone(event)
	}

	override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
		for touch in touches { report(.pointercancel, touch) }
		finishIfDone(event)
	}

	private func finishIfDone(_ event: UIEvent) {
		if event.allTouches?.allSatisfy({ $0.phase == .ended || $0.phase == .cancelled }) ?? true { state = .failed }
	}

	override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool { false }
	override func canBePrevented(by preventingGestureRecognizer: UIGestureRecognizer) -> Bool { false }
}

/// A modal overlay's top layer; a touch on it outside the lifted view's elements is a touch on the overlay element.
final class OverlayLayerView: UIView {
	let node: String
	var onEscape: (() -> Bool)?

	init(node: String) {
		self.node = node
		super.init(frame: .zero)
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("built in code") }

	override func accessibilityPerformEscape() -> Bool { onEscape?() ?? false }
}

/// The white padded box a lifted overlay sits in; the stacking layout leaves its constraints alone.
final class OverlayCard: UIView {}

/// The view of an element marked `overlay`: VoiceOver's escape gesture inside it dismisses the topmost overlay.
final class OverlayElementView: UIView {
	var onEscape: (() -> Bool)?
	override func accessibilityPerformEscape() -> Bool { onEscape?() ?? false }
}
#endif
