// Assemble a folder of PNG frames (0000.png, 0001.png, ...) into an H.264 MP4 with the
// encoder built into macOS (AVFoundation), so the video ads need no ffmpeg download.
//
//   swiftc -O frames2mp4.swift -o frames2mp4
//   ./frames2mp4 <frames dir> <out.mp4> <fps> [cropX cropY cropW cropH] [holdSeconds]
//
// The crop cuts the same rectangle out of every frame - how the 4:5 feed version is made
// from the 9:16 frames. holdSeconds repeats the last frame so the end card stays readable.
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count == 4 || args.count == 5 || args.count == 8 || args.count == 9 else {
    fail("usage: frames2mp4 <dir> <out.mp4> <fps> [x y w h] [holdSeconds]")
}
let dir = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
guard let fps = Int32(args[3]), fps > 0 else { fail("bad fps") }
var crop: CGRect? = nil
var hold = 0.0
if args.count >= 8 {
    let v = args[4...7].map { Double($0) ?? -1 }
    if v.contains(where: { $0 < 0 }) { fail("bad crop") }
    crop = CGRect(x: v[0], y: v[1], width: v[2], height: v[3])
    if args.count == 9 { hold = Double(args[8]) ?? 0 }
} else if args.count == 5 {
    hold = Double(args[4]) ?? 0
}

let files = (try? FileManager.default.contentsOfDirectory(atPath: dir.path))?
    .filter { $0.hasSuffix(".png") }.sorted() ?? []
if files.isEmpty { fail("no frames in \(dir.path)") }

func load(_ name: String) -> CGImage {
    let url = dir.appendingPathComponent(name)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fail("cannot read \(name)") }
    if let c = crop {
        guard let cut = img.cropping(to: c) else { fail("crop outside \(name)") }
        return cut
    }
    return img
}

let first = load(files[0])
let w = first.width, h = first.height
if w % 2 != 0 || h % 2 != 0 { fail("frame size must be even, got \(w)x\(h)") }

try? FileManager.default.removeItem(at: out)
guard let writer = try? AVAssetWriter(outputURL: out, fileType: .mp4) else { fail("cannot create writer") }
let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: w,
    AVVideoHeightKey: h,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 8_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoMaxKeyFrameIntervalKey: Int(fps) * 2,
    ],
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: w,
    kCVPixelBufferHeightKey as String: h,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

func buffer(_ img: CGImage) -> CVPixelBuffer {
    var pb: CVPixelBuffer?
    guard let pool = adaptor.pixelBufferPool,
          CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb) == kCVReturnSuccess, let b = pb else {
        fail("no pixel buffer")
    }
    CVPixelBufferLockBaseAddress(b, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(b), width: w, height: h, bitsPerComponent: 8,
                        bytesPerRow: CVPixelBufferGetBytesPerRow(b), space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    CVPixelBufferUnlockBaseAddress(b, [])
    return b
}

var names = files
let extra = Int((hold * Double(fps)).rounded())
if extra > 0 { names += Array(repeating: files.last!, count: extra) }
for (i, name) in names.enumerated() {
    while !input.isReadyForMoreMediaData { usleep(2000) }
    let img = (i == 0) ? first : load(name)
    if img.width != w || img.height != h { fail("\(name) is \(img.width)x\(img.height), expected \(w)x\(h)") }
    if !adaptor.append(buffer(img), withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps)) {
        fail("append failed at \(name): \(writer.error?.localizedDescription ?? "?")")
    }
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { fail("writer: \(writer.error?.localizedDescription ?? "unknown")") }
print("\(out.lastPathComponent): \(names.count) frames, \(w)x\(h), \(fps) fps")
