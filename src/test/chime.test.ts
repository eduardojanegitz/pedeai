import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------- Som (Web Audio simulado) ----------

describe("chime", () => {
  type FakeOsc = { start: ReturnType<typeof vi.fn> };
  let oscillators: FakeOsc[];
  let state: "suspended" | "running";

  beforeEach(() => {
    vi.resetModules();
    oscillators = [];
    state = "suspended";
    class FakeCtx {
      get state() {
        return state;
      }
      currentTime = 0;
      destination = {};
      async resume() {
        state = "running";
      }
      createGain() {
        const node = {
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: (n: unknown) => n,
        };
        return node;
      }
      createOscillator() {
        const o = {
          type: "",
          frequency: { value: 0 },
          connect: (n: unknown) => n,
          start: vi.fn(),
          stop: vi.fn(),
        };
        oscillators.push(o);
        return o;
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
  });

  it("antes de liberar, não toca; depois do clique, toca", async () => {
    const chime = await import("@/features/admin/chime");
    expect(chime.soundReady()).toBe(false);
    expect(chime.playChime("new", 1)).toBe(false);
    expect(oscillators).toHaveLength(0);
    expect(await chime.unlockSound()).toBe(true);
    expect(chime.soundReady()).toBe(true);
    expect(chime.playChime("new", 1)).toBe(true);
    expect(oscillators).toHaveLength(3);
  });
  it("cada tipo tem som próprio", async () => {
    const chime = await import("@/features/admin/chime");
    await chime.unlockSound();
    chime.playChime("edited", 0.5);
    expect(oscillators).toHaveLength(2);
    chime.playChime("cancelled", 0.5);
    expect(oscillators).toHaveLength(4);
  });
  it("sem Web Audio, informa que não há suporte", async () => {
    (window as unknown as { AudioContext: unknown }).AudioContext = undefined;
    const chime = await import("@/features/admin/chime");
    expect(chime.soundSupported()).toBe(false);
    expect(await chime.unlockSound()).toBe(false);
  });
});
