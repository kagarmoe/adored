// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { BodyTooLargeError, readJsonWithLimit } from "./read-json-with-limit";

const encoder = new TextEncoder();

function postRequest(body: ReadableStream<Uint8Array> | null): Request {
  return new Request("http://test.local/api/batch", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
}

function streamedChunks(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("readJsonWithLimit", () => {
  it("throws BodyTooLargeError and cancels the stream when a Content-Length-less streamed body exceeds the budget (F17)", async () => {
    const cancelSpy = vi.fn();
    // Pull-based and never closed: the body is unbounded, exactly the chunked
    // transfer shape Content-Length cannot describe.
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoder.encode("x".repeat(32)));
      },
      cancel: cancelSpy,
    });
    const req = postRequest(stream);
    expect(req.headers.get("content-length")).toBeNull();

    await expect(readJsonWithLimit(req, 64)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(cancelSpy).toHaveBeenCalled();
  });

  it("parses a small streamed body to the JSON value", async () => {
    const payload = JSON.stringify({ decisions: [{ hello: "world" }] });
    const req = postRequest(streamedChunks([payload.slice(0, 7), payload.slice(7)]));
    await expect(readJsonWithLimit(req, 65_536)).resolves.toEqual({
      decisions: [{ hello: "world" }],
    });
  });

  it("throws SyntaxError on malformed JSON under budget", async () => {
    const req = postRequest(streamedChunks(["{not json"]));
    await expect(readJsonWithLimit(req, 65_536)).rejects.toBeInstanceOf(SyntaxError);
  });

  it("throws SyntaxError on a null body (parses empty)", async () => {
    const req = new Request("http://test.local/api/batch", { method: "POST" });
    expect(req.body).toBeNull();
    await expect(readJsonWithLimit(req, 65_536)).rejects.toBeInstanceOf(SyntaxError);
  });

  it("accepts a body exactly at the budget", async () => {
    const payload = JSON.stringify({ pad: "x".repeat(50) });
    const req = postRequest(streamedChunks([payload]));
    await expect(readJsonWithLimit(req, encoder.encode(payload).byteLength)).resolves.toEqual({
      pad: "x".repeat(50),
    });
  });
});
