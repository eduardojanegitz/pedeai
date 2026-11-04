import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sceneAt, TIMELINE, useSceneTimeline } from "@/features/order/successTimeline";

describe("timeline da animação de conclusão", () => {
  it("cenas em ordem crescente de tempo", () => {
    const t = TIMELINE.created;
    expect(t.cart).toBeLessThan(t.burst);
    expect(t.burst).toBeLessThan(t.logo);
    expect(t.logo).toBeLessThan(t.final);
    expect(t.final).toBeLessThanOrEqual(4000); // a mensagem final não demora demais
  });

  it("sceneAt devolve a cena do instante", () => {
    expect(sceneAt("created", 0)).toBe("cart");
    expect(sceneAt("created", 1200)).toBe("burst");
    expect(sceneAt("created", 2500)).toBe("logo");
    expect(sceneAt("created", 9000)).toBe("final");
  });

  it("a atualização pula a explosão", () => {
    expect(sceneAt("updated", 0)).toBe("cart");
    expect(sceneAt("updated", 1200)).toBe("logo");
    expect(sceneAt("updated", 2500)).toBe("final");
  });
});

describe("useSceneTimeline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("avança cart → burst → logo → final", () => {
    const { result } = renderHook(() =>
      useSceneTimeline("created", { reduce: false, skipped: false }),
    );
    expect(result.current).toBe("cart");
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe("burst");
    act(() => void vi.advanceTimersByTime(900));
    expect(result.current).toBe("logo");
    act(() => void vi.advanceTimersByTime(1300));
    expect(result.current).toBe("final");
  });

  it("movimento reduzido vai direto ao final", () => {
    const { result } = renderHook(() =>
      useSceneTimeline("created", { reduce: true, skipped: false }),
    );
    expect(result.current).toBe("final");
  });

  it("pular leva ao final", () => {
    const { result, rerender } = renderHook(
      ({ skipped }) => useSceneTimeline("created", { reduce: false, skipped }),
      {
        initialProps: { skipped: false },
      },
    );
    expect(result.current).toBe("cart");
    rerender({ skipped: true });
    expect(result.current).toBe("final");
  });

  it("atualização: cart → logo → final, sem burst", () => {
    const seen: string[] = [];
    const { result } = renderHook(() => {
      const s = useSceneTimeline("updated", { reduce: false, skipped: false });
      if (seen.at(-1) !== s) seen.push(s);
      return s;
    });
    act(() => void vi.advanceTimersByTime(800));
    act(() => void vi.advanceTimersByTime(1200));
    expect(result.current).toBe("final");
    expect(seen).toEqual(["cart", "logo", "final"]);
  });
});
