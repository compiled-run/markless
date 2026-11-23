#if canImport(UIKit)
import MarklessCore
import UIKit
import UniformTypeIdentifiers

/// `<input type="file">` as Safari draws it unstyled: a Choose File button and what was chosen. A press, or the page's
/// `showPicker()`, opens the system's document picker with the input's `accept` and `multiple`.
final class FileInputView: UIStackView, UIDocumentPickerDelegate {
	/// The files chosen, after the picker closes.
	var onPick: (([NativePickedFile]) -> Void)?
	var presenter: () -> UIViewController? = { nil }
	var accept = ""
	var multiple = false {
		didSet { button.setTitle(multiple ? "Choose Files" : "Choose File", for: .normal) }
	}
	/// Where each chosen file was copied, in order, for a later upload to read.
	private(set) var chosen: [URL] = []
	private let button = UIButton(type: .system)
	private let summary = UILabel()

	/// `unseen`: a family's visually hidden field (aria-hidden), which shows nothing and opens only from `showPicker()`.
	init(unseen: Bool) {
		super.init(frame: .zero)
		axis = .horizontal
		spacing = 8
		alignment = .center
		button.setTitle("Choose File", for: .normal)
		button.addAction(UIAction { [weak self] _ in self?.open() }, for: .touchUpInside)
		summary.text = "no file selected"
		summary.textColor = .secondaryLabel
		if unseen {
			isAccessibilityElement = false
			accessibilityElementsHidden = true
			return
		}
		addArrangedSubview(button)
		addArrangedSubview(summary)
	}

	required init(coder: NSCoder) { fatalError("init(coder:) is not used") }

	func open() {
		if let answer = FileInputView.testAnswer {
			DispatchQueue.main.async { [weak self] in self?.chose(answer) }
			return
		}
		guard let presenter = presenter() else { return }
		let picker = UIDocumentPickerViewController(forOpeningContentTypes: FileInputView.types(accept), asCopy: true)
		picker.allowsMultipleSelection = multiple
		picker.delegate = self
		presenter.present(picker, animated: true)
	}

	func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { chose(urls) }

	/// What a handler gave the input, as a JSON array of names: it shows them as it shows a choice.
	func show(names: String) {
		let given = (try? JSONSerialization.jsonObject(with: Data(names.utf8)) as? [String]) ?? []
		summary.text = given.count == 1 ? given[0] : given.isEmpty ? "no file selected" : "\(given.count) files"
	}

	private func chose(_ urls: [URL]) {
		let urls = multiple ? urls : Array(urls.prefix(1))
		chosen = urls
		summary.text = urls.count == 1 ? urls[0].lastPathComponent : urls.isEmpty ? "no file selected" : "\(urls.count) files"
		onPick?(urls.map(FileInputView.described))
	}

	private static func described(_ url: URL) -> NativePickedFile {
		let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
		let modified = values?.contentModificationDate ?? Date()
		return NativePickedFile(
			name: url.lastPathComponent, size: Double(values?.fileSize ?? 0),
			type: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "",
			lastModified: (modified.timeIntervalSince1970 * 1000).rounded(.down))
	}

	/// The picker's types for an `accept` list: `.txt`, `image/*` and `text/plain` each name a type; none, any file.
	private static func types(_ accept: String) -> [UTType] {
		let types = accept.split(separator: ",").compactMap { part -> UTType? in
			let pattern = part.trimmingCharacters(in: .whitespaces).lowercased()
			if pattern.hasPrefix(".") { return UTType(filenameExtension: String(pattern.dropFirst())) }
			if pattern.hasSuffix("/*") {
				return ["image": UTType.image, "video": .movie, "audio": .audio, "text": .text][String(pattern.dropLast(2))]
			}
			return UTType(mimeType: pattern)
		}
		return types.isEmpty ? [.item] : types
	}

	/// The `-pick <json>` launch argument: files every picker answers with at once, written to the app's temporary folder.
	/// The proofs use it as the web test's file chooser does; the system picker is not ours to drive.
	private static let testAnswer: [URL]? = {
		let arguments = ProcessInfo.processInfo.arguments
		guard let index = arguments.firstIndex(of: "-pick"), index + 1 < arguments.count,
			let data = arguments[index + 1].data(using: .utf8),
			let files = try? JSONSerialization.jsonObject(with: data) as? [[String: String]]
		else { return nil }
		let folder = FileManager.default.temporaryDirectory.appendingPathComponent("markless-pick", isDirectory: true)
		try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
		return files.compactMap { file in
			guard let name = file["name"], let text = file["text"] else { return nil }
			let url = folder.appendingPathComponent(name)
			return (try? Data(text.utf8).write(to: url)) == nil ? nil : url
		}
	}()
}
#endif
