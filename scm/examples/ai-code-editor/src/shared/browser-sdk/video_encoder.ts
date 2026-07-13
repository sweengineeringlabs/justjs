// Video encoder — assembles JPEG frames into an MJPEG AVI container.
// Pure TypeScript, no external dependencies.
//
// MJPEG AVI is supported by all major video players (VLC, mpv, Windows Media
// Player, QuickTime, browser <video> tags) and consists of JPEG frames wrapped
// in a RIFF/AVI container with minimal header overhead.

import { writeFileSync, openSync, writeSync, closeSync } from "fs";

// just_fs_write_base64 is a native FFI function — available globally in jsc runtime.

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class VideoResult {
  path: string;
  width: number;
  height: number;
  frameCount: number;
  fps: number;
  durationMs: number;
  fileSizeBytes: number;
  constructor(path: string, width: number, height: number, frameCount: number, fps: number, durationMs: number, fileSizeBytes: number) {
    this.path = path;
    this.width = width;
    this.height = height;
    this.frameCount = frameCount;
    this.fps = fps;
    this.durationMs = durationMs;
    this.fileSizeBytes = fileSizeBytes;
  }
}

export function encodeAviMjpeg(
  frames: Uint8Array[],
  width: number,
  height: number,
  fps: number,
  outputPath: string
): VideoResult {
  if (frames.length === 0) {
    return new VideoResult(outputPath, width, height, 0, fps, 0, 0);
  }

  let usPerFrame: number = Math.round(1000000 / fps);
  let totalFrames: number = frames.length;

  // Calculate total size of all frame data (each frame is a JUNK-padded RIFF chunk)
  let moviDataSize: number = 0;
  let chunkSizes: number[] = [];
  let fi: number = 0;
  while (fi < totalFrames) {
    let frameSize: number = frames[fi].length;
    // Each frame chunk: 4 bytes ID ("00dc") + 4 bytes size + data + optional pad byte
    let paddedSize: number = frameSize + (frameSize % 2);
    chunkSizes.push(paddedSize);
    moviDataSize = moviDataSize + 8 + paddedSize;
    fi = fi + 1;
  }

  // Build index (idx1) entries: 16 bytes per frame
  let idx1Size: number = totalFrames * 16;

  // AVI structure sizes
  let avihSize: number = 56;
  let strhSize: number = 56;
  let strfSize: number = 40;
  let strlListSize: number = 4 + (8 + strhSize) + (8 + strfSize); // "strl" + strh chunk + strf chunk
  let hdrlListSize: number = 4 + (8 + avihSize) + (8 + strlListSize); // "hdrl" + avih chunk + strl LIST
  let moviListSize: number = 4 + moviDataSize; // "movi" + frame chunks

  // Total RIFF size: hdrl LIST + movi LIST + idx1 chunk
  let riffSize: number = 4 + (8 + hdrlListSize) + (8 + moviListSize) + (8 + idx1Size);

  // Allocate buffer
  let buf: Uint8Array = new Uint8Array(8 + riffSize);
  let view: DataView = new DataView(buf.buffer);
  let pos: number = 0;

  // ─── RIFF header ───
  pos = writeStr(buf, pos, "RIFF");
  view.setUint32(pos, riffSize, true); pos = pos + 4;
  pos = writeStr(buf, pos, "AVI ");

  // ─── hdrl LIST ───
  pos = writeStr(buf, pos, "LIST");
  view.setUint32(pos, hdrlListSize, true); pos = pos + 4;
  pos = writeStr(buf, pos, "hdrl");

  // ─── avih (main AVI header) ───
  pos = writeStr(buf, pos, "avih");
  view.setUint32(pos, avihSize, true); pos = pos + 4;
  view.setUint32(pos, usPerFrame, true); pos = pos + 4;     // dwMicroSecPerFrame
  view.setUint32(pos, 0, true); pos = pos + 4;              // dwMaxBytesPerSec
  view.setUint32(pos, 0, true); pos = pos + 4;              // dwPaddingGranularity
  view.setUint32(pos, 0x10 | 0x20, true); pos = pos + 4;    // dwFlags: HASINDEX | MUSTUSEINDEX
  view.setUint32(pos, totalFrames, true); pos = pos + 4;    // dwTotalFrames
  view.setUint32(pos, 0, true); pos = pos + 4;              // dwInitialFrames
  view.setUint32(pos, 1, true); pos = pos + 4;              // dwStreams
  view.setUint32(pos, 0, true); pos = pos + 4;              // dwSuggestedBufferSize
  view.setUint32(pos, width, true); pos = pos + 4;          // dwWidth
  view.setUint32(pos, height, true); pos = pos + 4;         // dwHeight
  // Reserved (4 x 4 bytes)
  view.setUint32(pos, 0, true); pos = pos + 4;
  view.setUint32(pos, 0, true); pos = pos + 4;
  view.setUint32(pos, 0, true); pos = pos + 4;
  view.setUint32(pos, 0, true); pos = pos + 4;

  // ─── strl LIST (stream list) ───
  pos = writeStr(buf, pos, "LIST");
  view.setUint32(pos, strlListSize, true); pos = pos + 4;
  pos = writeStr(buf, pos, "strl");

  // ─── strh (stream header) ───
  pos = writeStr(buf, pos, "strh");
  view.setUint32(pos, strhSize, true); pos = pos + 4;
  pos = writeStr(buf, pos, "vids");                          // fccType
  pos = writeStr(buf, pos, "MJPG");                          // fccHandler
  view.setUint32(pos, 0, true); pos = pos + 4;              // dwFlags
  view.setUint16(pos, 0, true); pos = pos + 2;              // wPriority
  view.setUint16(pos, 0, true); pos = pos + 2;              // wLanguage
  view.setUint32(pos, 0, true); pos = pos + 4;              // dwInitialFrames
  view.setUint32(pos, 1, true); pos = pos + 4;              // dwScale
  view.setUint32(pos, fps, true); pos = pos + 4;            // dwRate
  view.setUint32(pos, 0, true); pos = pos + 4;              // dwStart
  view.setUint32(pos, totalFrames, true); pos = pos + 4;    // dwLength
  view.setUint32(pos, 0, true); pos = pos + 4;              // dwSuggestedBufferSize
  view.setUint32(pos, 0xFFFFFFFF, true); pos = pos + 4;     // dwQuality (-1)
  view.setUint32(pos, 0, true); pos = pos + 4;              // dwSampleSize
  // rcFrame (left, top, right, bottom as 16-bit)
  view.setInt16(pos, 0, true); pos = pos + 2;
  view.setInt16(pos, 0, true); pos = pos + 2;
  view.setInt16(pos, width, true); pos = pos + 2;
  view.setInt16(pos, height, true); pos = pos + 2;

  // ─── strf (stream format — BITMAPINFOHEADER) ───
  pos = writeStr(buf, pos, "strf");
  view.setUint32(pos, strfSize, true); pos = pos + 4;
  view.setUint32(pos, 40, true); pos = pos + 4;             // biSize
  view.setInt32(pos, width, true); pos = pos + 4;           // biWidth
  view.setInt32(pos, height, true); pos = pos + 4;          // biHeight
  view.setUint16(pos, 1, true); pos = pos + 2;              // biPlanes
  view.setUint16(pos, 24, true); pos = pos + 2;             // biBitCount
  pos = writeStr(buf, pos, "MJPG");                          // biCompression
  view.setUint32(pos, width * height * 3, true); pos = pos + 4; // biSizeImage
  view.setUint32(pos, 0, true); pos = pos + 4;              // biXPelsPerMeter
  view.setUint32(pos, 0, true); pos = pos + 4;              // biYPelsPerMeter
  view.setUint32(pos, 0, true); pos = pos + 4;              // biClrUsed
  view.setUint32(pos, 0, true); pos = pos + 4;              // biClrImportant

  // ─── movi LIST (frame data) ───
  pos = writeStr(buf, pos, "LIST");
  view.setUint32(pos, moviListSize, true); pos = pos + 4;
  pos = writeStr(buf, pos, "movi");

  let moviStart: number = pos;

  let wi: number = 0;
  while (wi < totalFrames) {
    pos = writeStr(buf, pos, "00dc"); // stream 0, compressed (dc)
    view.setUint32(pos, frames[wi].length, true); pos = pos + 4;
    buf.set(frames[wi], pos);
    pos = pos + frames[wi].length;
    // Pad to 2-byte boundary
    if (frames[wi].length % 2 !== 0) {
      buf[pos] = 0;
      pos = pos + 1;
    }
    wi = wi + 1;
  }

  // ─── idx1 (AVI index) ───
  pos = writeStr(buf, pos, "idx1");
  view.setUint32(pos, idx1Size, true); pos = pos + 4;

  let offset: number = 4; // offset relative to movi start (after "movi" fourcc)
  let ii: number = 0;
  while (ii < totalFrames) {
    pos = writeStr(buf, pos, "00dc");                         // ckid
    view.setUint32(pos, 0x10, true); pos = pos + 4;          // dwFlags: KEYFRAME
    view.setUint32(pos, offset, true); pos = pos + 4;        // dwOffset
    view.setUint32(pos, frames[ii].length, true); pos = pos + 4; // dwSize
    offset = offset + 8 + chunkSizes[ii];
    ii = ii + 1;
  }

  // Write to disk — encode as base64 for native binary file writing
  let bytes: Uint8Array = new Uint8Array(buf);
  let b64Str: string = "";
  let chars: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let bi: number = 0;
  while (bi < bytes.length) {
    let a: number = bytes[bi];
    let b: number = bi + 1 < bytes.length ? bytes[bi + 1] : 0;
    let c: number = bi + 2 < bytes.length ? bytes[bi + 2] : 0;
    b64Str = b64Str + chars.charAt(a >> 2);
    b64Str = b64Str + chars.charAt(((a & 3) << 4) | (b >> 4));
    b64Str = b64Str + (bi + 1 < bytes.length ? chars.charAt(((b & 15) << 2) | (c >> 6)) : "=");
    b64Str = b64Str + (bi + 2 < bytes.length ? chars.charAt(c & 63) : "=");
    bi = bi + 3;
  }
  // @ts-ignore — native FFI function, available at jsc runtime
  just_fs_write_base64(outputPath, b64Str);

  let durationMs: number = Math.round((totalFrames / fps) * 1000);
  return new VideoResult(outputPath, width, height, totalFrames, fps, durationMs, buf.length);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeStr(buf: Uint8Array, pos: number, str: string): number {
  let i: number = 0;
  while (i < str.length) {
    buf[pos + i] = str.charCodeAt(i);
    i = i + 1;
  }
  return pos + str.length;
}

// ---------------------------------------------------------------------------
// JPEG dimension extraction
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Streaming AVI writer — writes frames to disk incrementally
// ---------------------------------------------------------------------------

export class AviStreamWriter {
  fd: number;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  maxFrames: number;
  frameCount: number;
  moviStart: number;
  // Per-frame index entries: [offset, size]
  index: number[][];

  constructor(outputPath: string, width: number, height: number, fps: number, maxFrames: number) {
    this.outputPath = outputPath;
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.maxFrames = maxFrames;
    this.frameCount = 0;
    this.index = [];

    // Open file and write placeholder header (will be rewritten in finish())
    this.fd = openSync(outputPath, "w");
    let header: Uint8Array = this.buildHeader(0, 0);
    writeSync(this.fd, header, 0, header.length, 0);

    // Write movi LIST header (placeholder size)
    let moviHead: Uint8Array = new Uint8Array(12);
    let mv: DataView = new DataView(moviHead.buffer);
    writeStrBuf(moviHead, 0, "LIST");
    mv.setUint32(4, 0, true); // placeholder — rewritten in finish()
    writeStrBuf(moviHead, 8, "movi");
    writeSync(this.fd, moviHead, 0, 12, null);
    this.moviStart = header.length + 12;
  }

  addFrame(jpegData: Uint8Array): boolean {
    if (this.maxFrames > 0 && this.frameCount >= this.maxFrames) return false;

    let frameSize: number = jpegData.length;
    let paddedSize: number = frameSize + (frameSize % 2);

    // Write chunk header: "00dc" + 4-byte size
    let chunkHead: Uint8Array = new Uint8Array(8);
    let cv: DataView = new DataView(chunkHead.buffer);
    writeStrBuf(chunkHead, 0, "00dc");
    cv.setUint32(4, frameSize, true);
    writeSync(this.fd, chunkHead, 0, 8, null);

    // Write frame data
    writeSync(this.fd, jpegData, 0, frameSize, null);

    // Pad to 2-byte boundary
    if (frameSize % 2 !== 0) {
      let pad: Uint8Array = new Uint8Array(1);
      writeSync(this.fd, pad, 0, 1, null);
    }

    // Record index entry: offset relative to movi data start (after "movi" fourcc)
    let moviDataOffset: number = 4; // skip "movi" fourcc
    let fi: number = 0;
    while (fi < this.index.length) {
      moviDataOffset = moviDataOffset + 8 + this.index[fi][1];
      fi = fi + 1;
    }
    this.index.push([moviDataOffset, paddedSize]);
    this.frameCount = this.frameCount + 1;
    return true;
  }

  finish(): VideoResult {
    if (this.frameCount === 0) {
      closeSync(this.fd);
      return new VideoResult(this.outputPath, this.width, this.height, 0, this.fps, 0, 0);
    }

    // Calculate sizes
    let moviDataSize: number = 0;
    let fi: number = 0;
    while (fi < this.index.length) {
      moviDataSize = moviDataSize + 8 + this.index[fi][1];
      fi = fi + 1;
    }
    let moviListSize: number = 4 + moviDataSize; // "movi" + data

    // Write idx1
    let idx1Size: number = this.frameCount * 16;
    let idx1Head: Uint8Array = new Uint8Array(8);
    let ihv: DataView = new DataView(idx1Head.buffer);
    writeStrBuf(idx1Head, 0, "idx1");
    ihv.setUint32(4, idx1Size, true);
    writeSync(this.fd, idx1Head, 0, 8, null);

    let offset: number = 4; // relative to movi start (after "movi" fourcc)
    let ii: number = 0;
    while (ii < this.frameCount) {
      let entry: Uint8Array = new Uint8Array(16);
      let ev: DataView = new DataView(entry.buffer);
      writeStrBuf(entry, 0, "00dc");
      ev.setUint32(4, 0x10, true); // KEYFRAME
      ev.setUint32(8, offset, true);
      ev.setUint32(12, this.index[ii][1] - (this.index[ii][1] % 2 === 0 ? 0 : 0), true);
      writeSync(this.fd, entry, 0, 16, null);
      offset = offset + 8 + this.index[ii][1];
      ii = ii + 1;
    }

    // Rewrite header at position 0 with correct sizes
    let header: Uint8Array = this.buildHeader(this.frameCount, moviListSize + 8 + idx1Size);
    writeSync(this.fd, header, 0, header.length, 0);

    // Rewrite movi LIST size
    let moviSizeBuf: Uint8Array = new Uint8Array(4);
    let msv: DataView = new DataView(moviSizeBuf.buffer);
    msv.setUint32(0, moviListSize, true);
    writeSync(this.fd, moviSizeBuf, 0, 4, header.length + 4); // offset past "LIST"

    closeSync(this.fd);

    let durationMs: number = Math.round((this.frameCount / this.fps) * 1000);
    // Compute file size from header
    let totalSize: number = header.length + 8 + moviListSize + 8 + idx1Size;
    return new VideoResult(this.outputPath, this.width, this.height, this.frameCount, this.fps, durationMs, totalSize);
  }

  private buildHeader(totalFrames: number, afterHdrlSize: number): Uint8Array {
    let usPerFrame: number = Math.round(1000000 / this.fps);
    let avihSize: number = 56;
    let strhSize: number = 56;
    let strfSize: number = 40;
    let strlListSize: number = 4 + (8 + strhSize) + (8 + strfSize);
    let hdrlListSize: number = 4 + (8 + avihSize) + (8 + strlListSize);
    let riffSize: number = 4 + (8 + hdrlListSize) + afterHdrlSize;

    let headerSize: number = 8 + 4 + 8 + hdrlListSize;
    let buf: Uint8Array = new Uint8Array(headerSize);
    let view: DataView = new DataView(buf.buffer);
    let pos: number = 0;

    // RIFF header
    pos = writeStrBuf(buf, pos, "RIFF");
    view.setUint32(pos, riffSize, true); pos = pos + 4;
    pos = writeStrBuf(buf, pos, "AVI ");

    // hdrl LIST
    pos = writeStrBuf(buf, pos, "LIST");
    view.setUint32(pos, hdrlListSize, true); pos = pos + 4;
    pos = writeStrBuf(buf, pos, "hdrl");

    // avih
    pos = writeStrBuf(buf, pos, "avih");
    view.setUint32(pos, avihSize, true); pos = pos + 4;
    view.setUint32(pos, usPerFrame, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint32(pos, 0x10 | 0x20, true); pos = pos + 4;
    view.setUint32(pos, totalFrames, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint32(pos, 1, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint32(pos, this.width, true); pos = pos + 4;
    view.setUint32(pos, this.height, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;

    // strl LIST
    pos = writeStrBuf(buf, pos, "LIST");
    view.setUint32(pos, strlListSize, true); pos = pos + 4;
    pos = writeStrBuf(buf, pos, "strl");

    // strh
    pos = writeStrBuf(buf, pos, "strh");
    view.setUint32(pos, strhSize, true); pos = pos + 4;
    pos = writeStrBuf(buf, pos, "vids");
    pos = writeStrBuf(buf, pos, "MJPG");
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint16(pos, 0, true); pos = pos + 2;
    view.setUint16(pos, 0, true); pos = pos + 2;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint32(pos, 1, true); pos = pos + 4;
    view.setUint32(pos, this.fps, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint32(pos, totalFrames, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint32(pos, 0xFFFFFFFF, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setInt16(pos, 0, true); pos = pos + 2;
    view.setInt16(pos, 0, true); pos = pos + 2;
    view.setInt16(pos, this.width, true); pos = pos + 2;
    view.setInt16(pos, this.height, true); pos = pos + 2;

    // strf (BITMAPINFOHEADER)
    pos = writeStrBuf(buf, pos, "strf");
    view.setUint32(pos, strfSize, true); pos = pos + 4;
    view.setUint32(pos, 40, true); pos = pos + 4;
    view.setInt32(pos, this.width, true); pos = pos + 4;
    view.setInt32(pos, this.height, true); pos = pos + 4;
    view.setUint16(pos, 1, true); pos = pos + 2;
    view.setUint16(pos, 24, true); pos = pos + 2;
    pos = writeStrBuf(buf, pos, "MJPG");
    view.setUint32(pos, this.width * this.height * 3, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;
    view.setUint32(pos, 0, true); pos = pos + 4;

    return buf;
  }
}

function writeStrBuf(buf: Uint8Array, pos: number, str: string): number {
  let i: number = 0;
  while (i < str.length) {
    buf[pos + i] = str.charCodeAt(i);
    i = i + 1;
  }
  return pos + str.length;
}

export function readJpegDimensions(data: Uint8Array): number[] {
  // Scan for SOF0 (0xFFC0) or SOF2 (0xFFC2) marker
  let i: number = 0;
  while (i < data.length - 8) {
    if (data[i] === 0xFF) {
      let marker: number = data[i + 1];
      if (marker === 0xC0 || marker === 0xC2) {
        // SOF marker: skip 2 bytes marker + 2 bytes length + 1 byte precision
        let height: number = (data[i + 5] << 8) | data[i + 6];
        let width: number = (data[i + 7] << 8) | data[i + 8];
        return [width, height];
      }
      // Skip to next marker
      if (marker !== 0x00 && marker !== 0xFF && marker !== 0xD8 && marker !== 0xD9) {
        let segLen: number = (data[i + 2] << 8) | data[i + 3];
        i = i + 2 + segLen;
        continue;
      }
    }
    i = i + 1;
  }
  return [0, 0];
}
