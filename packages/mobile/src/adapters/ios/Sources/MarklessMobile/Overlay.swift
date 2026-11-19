#if canImport(UIKit)
import MarklessCore
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// The overlay stack on screen: a modal overlay's view is lifted into its own top layer above the page (the stacking
/// layout's card: centred, white, 16 pt padding), a non-modal one stays where its `hidden` binding shows it. Touches are
/// reported as `pointerdown`/`pointerup` and VoiceOver's escape gesture as a `dismiss` of the topmost overlay.
@MainActor
final class OverlayHost {
	private let runtime: NativeRuntime
	private let root: UIView
	private let onAction: (NativeAction) -> Void
	/// The element (template) id a view stands for, or nil when it is no element.
	private let nodeOf: (UIView) -> String?
	private let viewOf: (String) -> UIView?
	/// Lays a container's children out again after one leaves or returns (the stacking layout only).
	private let restack: (UIView) -> Void
	private let reportsTouches: Bool
	/// Where a touch reports when it lands on no element: the page's first root element, the body's stand-in.
	private let pageElement: String?
	private var lifted: [(node: String, layer: OverlayLayerView, home: UIView, index: Int, frame: CGRect?)] = []
	private var observer: PointerObserver?
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
		} || payload.events.contains { $0.event == .pointerdown || $0.event == .pointerup }
		pageElement = payload.nodes.first { $0.parent == nil && $0.isElement }?.id
	}

	static func isOverlay(_ attributes: [String: String]) -> Bool { attributes[OverlayProtocol.attribute] != nil }

	/// Watches the screen's touches and opens the overlays the runtime already shows.
	func mount(in screen: UIView) throws {
		self.screen = screen
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

	private func report(_ event: NativeEventName, _ touch: UITouch) {
		// A page navigated away from stops hearing the screen's touches.
		guard root.superview != nil else {
			if let observer { observer.view?.removeGestureRecognizer(observer) }
			return
		}
		var at = touch.view
		var host: String?
		while let view = at, host == nil {
			host = nodeOf(view) ?? (view as? OverlayLayerView)?.node
			at = view.superview
		}
		guard let host = host ?? pageElement else { return }
		onAction(NativeAction(event: event, host: host))
	}
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

	override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
		for touch in touches { report(.pointerup, touch) }
		if event.allTouches?.allSatisfy({ $0.phase == .ended || $0.phase == .cancelled }) ?? true { state = .failed }
	}

	override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) { state = .failed }

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
