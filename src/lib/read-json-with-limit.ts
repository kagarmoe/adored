export class BodyTooLargeError extends Error {}

// Reads req.body with a byte budget (App Router has no bodyParser.sizeLimit;
// Content-Length is absent under chunked transfer — spec F17). Cancels the
// stream the moment the budget is exceeded, then parses the buffered bytes.
// Throws BodyTooLargeError (caller → 413) or SyntaxError (caller → 400).
export async function readJsonWithLimit(req: Request, maxBytes: number): Promise<unknown> {
  if (req.body === null) {
    return JSON.parse(""); // throws SyntaxError, same as any empty body
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError(`body exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(buffer));
}
