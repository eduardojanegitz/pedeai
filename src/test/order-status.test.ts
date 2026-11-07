import { describe, expect, it, vi } from "vitest";
import { isAllowedPushEndpoint, orderProgress } from "@/lib/order-status";
import { bytesToB64u, sendPush, vapidJwt, type VapidConfig } from "@/lib/webpush.server";

describe("orderProgress", () => {
  it("recebido enquanto a rodada aceita pedidos", () => {
    expect(orderProgress({ roundState: "open", doneAt: null })).toBe("received");
    expect(orderProgress({ roundState: "waiting", doneAt: null })).toBe("received");
  });
  it("em preparo quando a rodada encerrou e não foi concluído", () => {
    expect(orderProgress({ roundState: "closed", doneAt: null })).toBe("preparing");
  });
  it("pronto quando concluído, em qualquer estado da rodada", () => {
    expect(orderProgress({ roundState: "open", doneAt: "2026-11-07T12:00:00Z" })).toBe("ready");
    expect(orderProgress({ roundState: "closed", doneAt: "2026-11-07T12:00:00Z" })).toBe("ready");
  });
});

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ])("aceita %s", (u) => expect(isAllowedPushEndpoint(u)).toBe(true));
  it.each([
    "http://fcm.googleapis.com/x",
    "https://evil.example.com/x",
    "https://fcm.googleapis.com.evil.com/x",
    "https://169.254.169.254/latest",
    "https://localhost:3000/x",
    "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "não é url",
  ])("recusa %s", (u) => expect(isAllowedPushEndpoint(u)).toBe(false));
});

async function newVapid(): Promise<VapidConfig & { pub: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return {
    publicKey: bytesToB64u(raw),
    privateKey: jwk.d as string,
    subject: "mailto:a@b.com",
    pub: pair.publicKey,
  };
}

describe("VAPID / sendPush", () => {
  it("gera JWT ES256 com assinatura válida e claims corretas", async () => {
    const cfg = await newVapid();
    const jwt = await vapidJwt(cfg, "https://fcm.googleapis.com", 1_700_000_000_000);
    const [h, p, s] = jwt.split(".") as [string, string, string];
    const dec = (x: string) => JSON.parse(Buffer.from(x, "base64url").toString());
    expect(dec(h)).toEqual({ typ: "JWT", alg: "ES256" });
    expect(dec(p)).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: 1_700_000_000 + 12 * 3600,
      sub: "mailto:a@b.com",
    });
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cfg.pub,
      Buffer.from(s, "base64url"),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(ok).toBe(true);
  });

  it("envia push vazio com cabeçalho vapid e mapeia respostas", async () => {
    const cfg = await newVapid();
    const f = vi.fn(async () => new Response(null, { status: 201 }));
    expect(await sendPush(cfg, "https://fcm.googleapis.com/fcm/send/x", f as never)).toBe("sent");
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["Authorization"]).toMatch(
      /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/,
    );
    expect(init.body).toBeUndefined();
    const gone = vi.fn(async () => new Response(null, { status: 410 }));
    expect(await sendPush(cfg, "https://fcm.googleapis.com/x", gone as never)).toBe("gone");
    const bad = vi.fn(async () => new Response(null, { status: 500 }));
    expect(await sendPush(cfg, "https://fcm.googleapis.com/x", bad as never)).toBe("failed");
    const boom = vi.fn(async () => {
      throw new Error("rede");
    });
    expect(await sendPush(cfg, "https://fcm.googleapis.com/x", boom as never)).toBe("failed");
  });
});
