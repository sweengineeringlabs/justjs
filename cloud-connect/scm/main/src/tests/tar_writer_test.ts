import { describe, it, expect } from "bun:test";
import { buildTarGz } from "../core/tar_writer.js";

// Real structural correctness proof - decodes the produced bytes
// directly at their real, spec-defined USTAR byte offsets, independent
// of buildTarGz()'s own logic (this test never calls back into the
// encoder to interpret its own output), mirroring the SigV4
// independent-cross-check precedent already in this package
// (tests/cloud_connect_int_test.ts's signAwsRequest suite).
function readField(tar: Uint8Array, offset: number, length: number): string {
  const bytes = tar.subarray(offset, offset + length);
  const nul = bytes.indexOf(0);
  return new TextDecoder().decode(nul === -1 ? bytes : bytes.subarray(0, nul));
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

describe("buildTarGz", () => {
  it("test_produces_a_real_gzip_stream_decodable_by_the_real_web_platform_decompressor", async () => {
    const gz = await buildTarGz([{ path: "a.txt", content: "hello" }]);
    // A real gzip stream starts with the magic bytes 0x1f 0x8b - proves
    // real compression happened, not just raw tar bytes mislabeled.
    expect(gz[0]).toBe(0x1f);
    expect(gz[1]).toBe(0x8b);
    await expect(gunzip(gz)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("test_a_single_file_decodes_to_a_correct_ustar_header_and_content_at_the_real_byte_offsets", async () => {
    const content = "<h1>hi</h1>";
    const gz = await buildTarGz([{ path: "index.html", content }]);
    const tar = await gunzip(gz);

    expect(readField(tar, 0, 100)).toBe("index.html"); // name
    expect(readField(tar, 257, 5)).toBe("ustar"); // magic
    expect(readField(tar, 156, 1)).toBe("0"); // typeflag: regular file

    const size = parseInt(readField(tar, 124, 12) || "0", 8);
    expect(size).toBe(new TextEncoder().encode(content).length);

    const fileContent = new TextDecoder().decode(tar.subarray(512, 512 + size));
    expect(fileContent).toBe(content);

    // Independently recompute the checksum the same way the USTAR spec
    // defines it (sum of all header bytes, with the chksum field itself
    // treated as 8 ASCII spaces) and confirm it matches what was stored.
    const header = tar.subarray(0, 512).slice();
    header.set(new Uint8Array(8).fill(0x20), 148);
    let expectedChecksum = 0;
    for (const byte of header) {
      expectedChecksum += byte;
    }
    const storedChecksum = parseInt(readField(tar, 148, 6), 8);
    expect(storedChecksum).toBe(expectedChecksum);
  });

  it("test_multiple_files_each_get_their_own_correctly_offset_header", async () => {
    const gz = await buildTarGz([
      { path: "index.html", content: "<h1>hi</h1>" },
      { path: "nested/a.txt", content: "second file" },
    ]);
    const tar = await gunzip(gz);

    const firstSize = parseInt(readField(tar, 124, 12), 8);
    const firstContentBlocks = Math.ceil(firstSize / 512) * 512;
    const secondHeaderOffset = 512 + firstContentBlocks;

    expect(readField(tar, secondHeaderOffset, 100)).toBe("nested/a.txt");
    const secondSize = parseInt(readField(tar, secondHeaderOffset + 124, 12), 8);
    const secondContentOffset = secondHeaderOffset + 512;
    expect(new TextDecoder().decode(tar.subarray(secondContentOffset, secondContentOffset + secondSize))).toBe("second file");
  });

  it("test_a_path_longer_than_100_bytes_splits_across_the_real_ustar_prefix_and_name_fields", async () => {
    const longPath = `${"a".repeat(120)}/index.html`;
    const gz = await buildTarGz([{ path: longPath, content: "x" }]);
    const tar = await gunzip(gz);

    const name = readField(tar, 0, 100);
    const prefix = readField(tar, 345, 155);
    expect(`${prefix}/${name}`).toBe(longPath);
  });

  it("test_ends_with_two_real_zero_blocks_marking_the_end_of_the_archive", async () => {
    const gz = await buildTarGz([{ path: "a.txt", content: "x" }]);
    const tar = await gunzip(gz);
    const lastBlocks = tar.subarray(tar.length - 1024);
    expect(lastBlocks.every((byte) => byte === 0)).toBe(true);
  });
});
