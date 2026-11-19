import Foundation
import UIKit

// The stand-in host's entry point beside the real host's: it only ever shows its one hand-made screen.
@MainActor
public enum MarklessRoot {
	public static func controller(payload: Data, style: Data?, fonts: [String: Data], path: String?) throws -> UIViewController {
		try MarklessViewController(payload: payload, style: style, fonts: fonts)
	}

	public static func open(_ path: String, in root: UIViewController) throws {}

	public static func path(of url: URL) -> String { url.path.isEmpty ? "/" : url.path }
}
