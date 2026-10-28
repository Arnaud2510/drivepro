import { describe, expect, it } from "vitest";
import { adminEnabled, checkAdminPassword, createAdminSession, verifyAdminSession } from "@/lib/admin-auth";

const env = { ADMIN_PASSWORD: "un-mot-de-passe-solide" };

describe("authentification administrateur", () => {
  it("est désactivée sans mot de passe ou avec un mot de passe trop court", () => {
    expect(adminEnabled({})).toBe(false);
    expect(adminEnabled({ ADMIN_PASSWORD: "court" })).toBe(false);
    expect(checkAdminPassword("court", { ADMIN_PASSWORD: "court" })).toBe(false);
    expect(adminEnabled(env)).toBe(true);
  });

  it("vérifie le mot de passe", () => {
    expect(checkAdminPassword("un-mot-de-passe-solide", env)).toBe(true);
    expect(checkAdminPassword("un-mot-de-passe-solidE", env)).toBe(false);
    expect(checkAdminPassword("", env)).toBe(false);
  });

  it("accepte une session valide et refuse une session expirée, falsifiée ou d'un ancien mot de passe", () => {
    const now = 1_800_000_000_000;
    const session = createAdminSession(now, env);
    expect(verifyAdminSession(session, now + 60_000, env)).toBe(true);
    expect(verifyAdminSession(session, now + 13 * 3600_000, env)).toBe(false);

    const [exp, sig] = session.split(".");
    expect(verifyAdminSession(`${Number(exp) + 3600}.${sig}`, now, env)).toBe(false);
    expect(verifyAdminSession(session, now, { ADMIN_PASSWORD: "nouveau-mot-de-passe-123" })).toBe(false);
    expect(verifyAdminSession(undefined, now, env)).toBe(false);
    expect(verifyAdminSession("n'importe-quoi", now, env)).toBe(false);
  });
});
