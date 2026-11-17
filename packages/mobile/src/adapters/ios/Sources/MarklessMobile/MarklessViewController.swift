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
///
/// Throws on anything this host does not implement; it never skips a node, op or style write.
@MainActor
public final class MarklessViewController: UIViewController {
	private let runtime: NativeRuntime
	private let layout: StyleLayout?
	private let faces: [String: UIFontDescriptor]
	private(set) var tree: ViewTree?

	public init(payload: Data, style: Data? = nil, fonts: [String: Data] = [:]) throws {
		let decoded = try NativeViewPayload.decode(payload)
		let runtime = NativeRuntime(payload: decoded)
		let texts = try runtime.texts()
		self.runtime = runtime
		layout = try style.map { try StyleExport.decode($0).resolve(for: decoded, initialTexts: texts) }
		faces = try registerFaces(layout?.fontFiles ?? [], fonts: fonts)
		super.init(nibName: nil, bundle: nil)
		tree = try ViewTree(payload: decoded, texts: texts, layout: layout, faces: faces) { [weak self] action in
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
		if let layout, traitCollection.displayScale != layout.dpr {
			fatalError("Markless iOS host: the style export was laid out at \(layout.dpr)x, this screen is \(traitCollection.displayScale)x")
		}
	}

	/// Runs the handler for an action and applies its journal, exactly as a tap does.
	public func perform(_ action: NativeAction) {
		do {
			let journal = try runtime.dispatch(action)
			try tree?.apply(journal)
		} catch {
			fatalError("Markless iOS host: \(error)")
		}
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
