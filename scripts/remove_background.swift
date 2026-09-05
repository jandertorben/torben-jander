// Stellt das Hauptmotiv eines Fotos mit Apples Vision-Framework frei (wie „Motiv kopieren“ in Fotos).
// Aufruf: swift scripts/remove_background.swift <quelle> <ziel.png>
import Foundation
import Vision
import CoreImage
import CoreImage.CIFilterBuiltins

let args = CommandLine.arguments
guard args.count == 3 else { fputs("Aufruf: remove_background.swift <quelle> <ziel.png>\n", stderr); exit(1) }
guard let input = CIImage(contentsOf: URL(fileURLWithPath: args[1])) else { fputs("Bild nicht lesbar\n", stderr); exit(1) }

let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(ciImage: input, options: [:])
try handler.perform([request])
guard let result = request.results?.first else { fputs("Kein Motiv erkannt\n", stderr); exit(2) }
let maskBuffer = try result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler)
let mask = CIImage(cvPixelBuffer: maskBuffer)

let filter = CIFilter.blendWithMask()
filter.inputImage = input
filter.backgroundImage = CIImage.empty()
filter.maskImage = mask
guard let output = filter.outputImage?.cropped(to: input.extent) else { exit(3) }

let context = CIContext()
try context.writePNGRepresentation(of: output, to: URL(fileURLWithPath: args[2]), format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, options: [:])
print("ok")
