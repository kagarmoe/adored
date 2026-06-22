import { describe, expect, it, vi, beforeEach } from "vitest";
import { apiGet, apiPost, apiPatch } from "./api-client";
import { ApiError } from "./api-error";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("api-client verbs build the right fetch call", () => {
  it("apiGet sends GET with the JSON content-type and no body, returns parsed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "c1", name: "Bags" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiGet<{ id: string; name: string }>("/api/collections/c1");

    expect(result).toEqual({ id: "c1", name: "Bags" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/collections/c1");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBeUndefined();
  });

  it("apiPost sends POST with the JSON-stringified body and JSON content-type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: "new" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiPost<{ id: string }>("/api/collections", { name: "Summer" });

    expect(result).toEqual({ id: "new" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/collections");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ name: "Summer" }));
  });

  it("apiPatch sends PATCH with the JSON-stringified body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "c1", name: "Renamed" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiPatch<{ id: string }>("/api/collections/c1", { name: "Renamed" });

    expect(result).toEqual({ id: "c1", name: "Renamed" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/collections/c1");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ name: "Renamed" }));
  });
});

describe("api-client success edge cases", () => {
  it("returns undefined for 204 No Content WITHOUT calling response.json()", async () => {
    const json = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiPatch<void>("/api/collections/c1/archive", { archived: true });

    expect(result).toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });
});

describe("api-client error handling on !ok", () => {
  it("throws ApiError carrying the status and the server's `error` field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(409, { error: "Name already exists" }));
    vi.stubGlobal("fetch", fetchMock);

    const err = await apiPost("/api/collections", { name: "dup" }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).message).toBe("Name already exists");
  });

  it("falls back to `HTTP <status>` when the error body has no `error` field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { detail: "nope" }));
    vi.stubGlobal("fetch", fetchMock);

    const err = await apiGet("/api/secret").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).message).toBe("HTTP 403");
  });

  it("falls back to `HTTP <status>` when the error body is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const err = await apiGet("/api/boom").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).message).toBe("HTTP 500");
  });

  it("wraps a network-level fetch rejection as ApiError(500, message)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const err = await apiGet("/api/anything").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).message).toBe("network down");
  });

  it("re-throws an ApiError unchanged (does not re-wrap as 500)", async () => {
    // The !ok branch throws ApiError(404); the outer catch must pass it through
    // untouched rather than collapsing it to a generic 500.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { error: "Not found" }));
    vi.stubGlobal("fetch", fetchMock);

    const err = await apiGet("/api/missing").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).message).toBe("Not found");
  });
});
