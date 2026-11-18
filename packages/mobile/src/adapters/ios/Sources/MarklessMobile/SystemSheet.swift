#if canImport(UIKit)
import UIKit

/// One `<native.sheet>`: its content views, built at mount and kept, shown in UIKit's page sheet while open.
@MainActor
final class SystemSheet: NSObject, UISheetPresentationControllerDelegate {
	enum State {
		case closed
		/// Opened before the page was on screen: presented when it appears.
		case waitingForWindow
		case shown(UIViewController)
	}

	let content = UIView()
	private(set) var state = State.closed
	/// Styled content: the content area and the document's size at a resting height; nil stacks the content.
	var area: ((Double) -> (viewport: CGSize, content: CGSize)?)?
	/// The sheet came to rest at another of its heights.
	var onRest: ((Double) -> Void)?
	private(set) var restingAt: Double
	private var snapPointOf: [UISheetPresentationController.Detent.Identifier: Double] = [:]
	private let snapPoints: [Double]
	private let dismissible: Bool
	private let modal: Bool
	private let onDismiss: () -> Void

	init(snapPoints: [Double], dismissible: Bool, modal: Bool, onDismiss: @escaping () -> Void) {
		self.snapPoints = snapPoints
		self.dismissible = dismissible
		self.modal = modal
		self.onDismiss = onDismiss
		restingAt = snapPoints.first ?? 1
	}

	func open(from host: UIViewController?) {
		guard case .closed = state else { return }
		guard let host, host.viewIfLoaded?.window != nil else {
			state = .waitingForWindow
			return
		}
		present(from: host)
	}

	func hostAppeared(_ host: UIViewController) {
		guard case .waitingForWindow = state else { return }
		present(from: host)
	}

	/// Dismisses it if shown; a sheet the platform already closed stays closed.
	func close(animated: Bool = true) {
		let current = state
		state = .closed
		if case let .shown(controller) = current { controller.dismiss(animated: animated) }
	}

	private func present(from host: UIViewController) {
		rest(at: snapPoints.first ?? 1)
		let controller = SheetController(content: content) { [weak self] in
			guard let self else { return nil }
			return self.area?(self.restingAt).map { (self.restingAt, $0.viewport, $0.content) }
		}
		controller.modalPresentationStyle = .pageSheet
		controller.isModalInPresentation = !dismissible
		let detents = snapPoints.map(detent)
		snapPointOf = Dictionary(uniqueKeysWithValues: zip(detents.map(\.identifier), snapPoints))
		if let presentation = controller.sheetPresentationController {
			presentation.detents = detents
			presentation.selectedDetentIdentifier = detents.first?.identifier
			presentation.prefersGrabberVisible = snapPoints.count == 2
			presentation.prefersScrollingExpandsWhenScrolledToEdge = true
			presentation.largestUndimmedDetentIdentifier = modal ? nil : detents.last?.identifier
			presentation.delegate = self
		}
		state = .shown(controller)
		// A sheet closed a moment ago may still be animating away; UIKit refuses a second presentation until it has gone.
		if let leaving = host.presentedViewController, let coordinator = leaving.transitionCoordinator {
			coordinator.animate(alongsideTransition: nil) { [weak self, weak host] _ in
				guard let self, let host, case .shown(controller) = self.state else { return }
				host.present(controller, animated: true)
			}
		} else {
			host.present(controller, animated: true)
		}
	}

	private func detent(_ fraction: Double) -> UISheetPresentationController.Detent {
		switch fraction {
		case 1: return .large()
		case 0.5: return .medium()
		default:
			return .custom(identifier: .init("markless.\(fraction)")) { context in context.maximumDetentValue * fraction }
		}
	}

	func sheetPresentationControllerDidChangeSelectedDetentIdentifier(_ sheetPresentationController: UISheetPresentationController) {
		guard let identifier = sheetPresentationController.selectedDetentIdentifier, let snapPoint = snapPointOf[identifier] else { return }
		rest(at: snapPoint)
		if case let .shown(controller as SheetController) = state { controller.layoutContent() }
	}

	private func rest(at snapPoint: Double) {
		guard snapPoint != restingAt else { return }
		restingAt = snapPoint
		onRest?(snapPoint)
	}

	func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
		guard case let .shown(controller) = state, controller === presentationController.presentedViewController else { return }
		state = .closed
		onDismiss()
	}
}

/// The presented page: the sheet's content in a scroll view that ends at the keyboard.
private final class SheetController: UIViewController {
	private let content: UIView
	/// For styled content: the height it rests at, its content area and the size its document takes there.
	private let area: () -> (snapPoint: Double, viewport: CGSize, content: CGSize)?
	private let scroll = UIScrollView()

	init(content: UIView, area: @escaping () -> (snapPoint: Double, viewport: CGSize, content: CGSize)?) {
		self.content = content
		self.area = area
		super.init(nibName: nil, bundle: nil)
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("SheetController is created from a sheet") }

	override func loadView() {
		let screen = UIView()
		scroll.alwaysBounceVertical = true
		scroll.keyboardDismissMode = .interactive
		scroll.translatesAutoresizingMaskIntoConstraints = false
		screen.addSubview(scroll)
		content.removeFromSuperview()
		scroll.addSubview(content)
		NSLayoutConstraint.activate([
			scroll.topAnchor.constraint(equalTo: screen.topAnchor),
			scroll.leadingAnchor.constraint(equalTo: screen.leadingAnchor),
			scroll.trailingAnchor.constraint(equalTo: screen.trailingAnchor),
			scroll.bottomAnchor.constraint(equalTo: screen.keyboardLayoutGuide.topAnchor),
		])
		if area() != nil {
			// Styled content is the web document Dragon laid out, whose canvas is white in either colour scheme.
			screen.backgroundColor = .white
			scroll.contentInsetAdjustmentBehavior = .never
			content.translatesAutoresizingMaskIntoConstraints = true
			layoutContent()
		} else {
			screen.backgroundColor = .systemBackground
			content.translatesAutoresizingMaskIntoConstraints = false
			let margins = screen.layoutMarginsGuide
			NSLayoutConstraint.activate([
				content.topAnchor.constraint(equalToSystemSpacingBelow: scroll.contentLayoutGuide.topAnchor, multiplier: 3),
				content.leadingAnchor.constraint(equalTo: margins.leadingAnchor),
				content.trailingAnchor.constraint(equalTo: margins.trailingAnchor),
				scroll.contentLayoutGuide.bottomAnchor.constraint(equalToSystemSpacingBelow: content.bottomAnchor, multiplier: 3),
			])
		}
		view = screen
	}

	func layoutContent() {
		guard let area = area() else { return }
		content.frame = CGRect(origin: .zero, size: area.content)
		scroll.contentSize = area.content
	}

	override func viewDidAppear(_ animated: Bool) {
		super.viewDidAppear(animated)
		guard let area = area() else { return }
		let shown = scroll.bounds.size
		if abs(shown.width - area.viewport.width) > 1 || abs(shown.height - area.viewport.height) > 1 {
			NSLog(
				"Markless iOS host: a system sheet at %.2f shows its content in %.1fx%.1f pt, laid out for %.1fx%.1f pt", area.snapPoint,
				shown.width, shown.height, area.viewport.width, area.viewport.height)
		}
	}
}
#endif
