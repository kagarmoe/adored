import { describe, it, expect } from "vitest";
import { jwtCallback, sessionCallback } from "./auth-callbacks";

describe("jwtCallback", () => {
  it("seeds id and name from the user on sign-in", async () => {
    const t = await jwtCallback({ token: {}, user: { id: "u1", email: "a@b.c", name: "Tessa" } } as any);
    expect(t.id).toBe("u1");
    expect(t.name).toBe("Tessa");
  });
  it("refreshes name on an update trigger", async () => {
    const t = await jwtCallback({ token: { id: "u1", name: "Old" }, trigger: "update", session: { name: "New" } } as any);
    expect(t.name).toBe("New");
  });
  it("clears name when the update sets it null", async () => {
    const t = await jwtCallback({ token: { id: "u1", name: "Old" }, trigger: "update", session: { name: null } } as any);
    expect(t.name).toBeNull();
  });
  it("leaves the token unchanged when no user and no update", async () => {
    const token = { id: "u1", name: "Kim" };
    expect(await jwtCallback({ token } as any)).toEqual(token);
  });
});

describe("sessionCallback", () => {
  it("copies id and name from the token to session.user", async () => {
    const s = await sessionCallback({ session: { user: { email: "a@b.c" } }, token: { id: "u1", name: "Tessa" } } as any);
    expect((s.user as any).id).toBe("u1");
    expect(s.user!.name).toBe("Tessa");
    expect(s.user!.email).toBe("a@b.c");
  });
  it("returns the session untouched when there is no user", async () => {
    const session = { expires: "2099-01-01" };
    expect(await sessionCallback({ session, token: { id: "u1" } } as any)).toBe(session);
  });
});
