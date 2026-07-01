// swift-tools-version: 6.0

import PackageDescription

let package = Package(
	name: "MarklessDesktopProof",
	platforms: [
		.macOS(.v14),
	],
	products: [
		.library(name: "MarklessDesktopProof", targets: ["MarklessDesktopProof"]),
	],
	targets: [
		.target(
			name: "MarklessDesktopProof",
			resources: [
				.process("Resources"),
			],
		),
		.testTarget(
			name: "MarklessDesktopProofTests",
			dependencies: ["MarklessDesktopProof"],
		),
	],
)
