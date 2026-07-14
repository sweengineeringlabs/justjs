import type { CloudDeployFile } from "../api/provider.js";

// A minimal, hand-rolled USTAR (POSIX tar) writer - Heroku's real build
// API needs a gzipped tarball at a URL, and there is no third-party
// archive library anywhere in this codebase to reach for (this app's
// own README calls out mermaid as its first-ever real third-party npm
// dependency, for a reason no Web Platform API could cover - tar has no
// such gap: the format is a simple, fully-specified fixed-block layout,
// and gzip compression is a real Web Platform primitive
// (CompressionStream). Only regular files are supported (no
// directories, symlinks, or long-path GNU extensions beyond USTAR's own
// prefix/name split) - this app's own virtual filesystem (core/fs.ts)
// only ever holds flat, plain-text files, so nothing more is needed.
const BLOCK_SIZE = 512;

function encodeAscii(text: string, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const encoded = new TextEncoder().encode(text);
  bytes.set(encoded.subarray(0, length));
  return bytes;
}

// Numeric header fields are octal ASCII digits, zero-padded to fill
// `length - 1` bytes, terminated by a single NUL - the real USTAR
// convention (distinct from the chksum field's own NUL+space
// terminator, see encodeChecksum below).
function encodeOctal(value: number, length: number): Uint8Array {
  const digits = value.toString(8).padStart(length - 1, "0");
  return encodeAscii(digits, length);
}

// chksum is 6 octal digits + NUL + space (8 bytes total) - the one
// header field with a terminator different from every other numeric
// field, per the USTAR spec.
function encodeChecksum(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  bytes.set(encodeAscii(value.toString(8).padStart(6, "0"), 6), 0);
  bytes[6] = 0;
  bytes[7] = 0x20;
  return bytes;
}

// USTAR's `name` field is only 100 bytes - a longer real path (this
// app's own file tree can nest arbitrarily deep) needs to split across
// `name` (<=100 bytes, the tail) and `prefix` (<=155 bytes, the head) at
// a real `/` boundary, per the spec's own prefix/name convention.
function splitPath(path: string): { name: string; prefix: string } {
  if (path.length <= 100) {
    return { name: path, prefix: "" };
  }
  for (let i = Math.min(path.length - 1, 155); i >= 0; i--) {
    if (path[i] === "/") {
      const prefix = path.slice(0, i);
      const name = path.slice(i + 1);
      if (prefix.length <= 155 && name.length > 0 && name.length <= 100) {
        return { name, prefix };
      }
    }
  }
  throw new Error(`tar_writer: path too long to encode in a USTAR header: "${path}"`);
}

function buildHeader(path: string, size: number, mtimeSeconds: number): Uint8Array {
  const header = new Uint8Array(BLOCK_SIZE);
  const { name, prefix } = splitPath(path);
  header.set(encodeAscii(name, 100), 0);
  header.set(encodeOctal(0o644, 8), 100); // mode
  header.set(encodeOctal(0, 8), 108); // uid
  header.set(encodeOctal(0, 8), 116); // gid
  header.set(encodeOctal(size, 12), 124); // size
  header.set(encodeOctal(mtimeSeconds, 12), 136); // mtime
  header.set(encodeAscii("        ", 8), 148); // chksum placeholder (8 spaces) for the sum below
  header.set(encodeAscii("0", 1), 156); // typeflag: regular file
  // linkname (157..257) stays zero - no symlinks
  header.set(encodeAscii("ustar\0", 6), 257); // magic
  header.set(encodeAscii("00", 2), 263); // version
  // uname/gname (265..329) and devmajor/devminor (329..345) stay zero
  header.set(encodeAscii(prefix, 155), 345); // prefix

  let checksum = 0;
  for (const byte of header) {
    checksum += byte;
  }
  header.set(encodeChecksum(checksum), 148);
  return header;
}

// Pads a block of file content to the next 512-byte boundary, per the
// USTAR spec - every header and every file's content occupy a whole
// number of 512-byte blocks.
function pad(length: number): Uint8Array {
  const remainder = length % BLOCK_SIZE;
  return remainder === 0 ? new Uint8Array(0) : new Uint8Array(BLOCK_SIZE - remainder);
}

export async function buildTarGz(files: readonly CloudDeployFile[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const blocks: Uint8Array[] = [];
  const mtimeSeconds = Math.floor(Date.now() / 1000);

  for (const file of files) {
    const contentBytes = encoder.encode(file.content);
    blocks.push(buildHeader(file.path, contentBytes.length, mtimeSeconds));
    blocks.push(contentBytes);
    blocks.push(pad(contentBytes.length));
  }
  // Two all-zero 512-byte blocks mark the end of a real tar archive.
  blocks.push(new Uint8Array(BLOCK_SIZE));
  blocks.push(new Uint8Array(BLOCK_SIZE));

  const totalLength = blocks.reduce((sum, block) => sum + block.length, 0);
  const tarBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const block of blocks) {
    tarBytes.set(block, offset);
    offset += block.length;
  }

  // Real Web Platform gzip compression (CompressionStream) - no
  // third-party library needed for this leg either.
  const compressionStream = new CompressionStream("gzip");
  const writer = compressionStream.writable.getWriter();
  void writer.write(tarBytes);
  void writer.close();
  const gzippedBuffer = await new Response(compressionStream.readable).arrayBuffer();
  return new Uint8Array(gzippedBuffer);
}
