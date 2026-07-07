import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import TurnstileWidget from "./TurnstileWidget";

interface RenderCallOptions {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
}

function setupTurnstileMock() {
  const renderMock = vi.fn<
    (container: HTMLElement, options: RenderCallOptions) => string
  >(() => "widget-1");
  const removeMock = vi.fn();
  const resetMock = vi.fn();
  window.turnstile = {
    render: renderMock,
    remove: removeMock,
    reset: resetMock,
  };
  return { renderMock, removeMock, resetMock };
}

describe("TurnstileWidget", () => {
  beforeEach(() => {
    setupTurnstileMock();
  });

  afterEach(() => {
    delete (window as { turnstile?: unknown }).turnstile;
  });

  test("マウント時にwindow.turnstile.renderがsitekeyと4つのコールバック付きで呼ばれる", async () => {
    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="site_abc" onToken={onToken} />);

    await waitFor(() => {
      expect(window.turnstile?.render).toHaveBeenCalledTimes(1);
    });

    const [, options] = vi.mocked(window.turnstile!.render).mock.calls[0];
    expect(options.sitekey).toBe("site_abc");
    expect(typeof options.callback).toBe("function");
    expect(typeof options["error-callback"]).toBe("function");
    expect(typeof options["expired-callback"]).toBe("function");
    expect(typeof options["timeout-callback"]).toBe("function");
  });

  test("renderのcallbackを呼ぶとonTokenがtoken文字列付きで発火する", async () => {
    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="site_abc" onToken={onToken} />);

    await waitFor(() => {
      expect(window.turnstile?.render).toHaveBeenCalledTimes(1);
    });

    const [, options] = vi.mocked(window.turnstile!.render).mock.calls[0];
    options.callback("tok_xyz");

    expect(onToken).toHaveBeenCalledWith("tok_xyz");
  });

  test("expired-callbackを呼ぶとonToken(null)が発火する", async () => {
    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="site_abc" onToken={onToken} />);

    await waitFor(() => {
      expect(window.turnstile?.render).toHaveBeenCalledTimes(1);
    });

    const [, options] = vi.mocked(window.turnstile!.render).mock.calls[0];
    options["expired-callback"]();

    expect(onToken).toHaveBeenCalledWith(null);
  });

  test("error-callbackを呼ぶとonToken(null)が発火する", async () => {
    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="site_abc" onToken={onToken} />);

    await waitFor(() => {
      expect(window.turnstile?.render).toHaveBeenCalledTimes(1);
    });

    const [, options] = vi.mocked(window.turnstile!.render).mock.calls[0];
    options["error-callback"]();

    expect(onToken).toHaveBeenCalledWith(null);
  });

  test("アンマウントでwindow.turnstile.removeがwidgetId付きで呼ばれる", async () => {
    const onToken = vi.fn();
    const { unmount } = render(
      <TurnstileWidget siteKey="site_abc" onToken={onToken} />,
    );

    await waitFor(() => {
      expect(window.turnstile?.render).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(window.turnstile?.remove).toHaveBeenCalledWith("widget-1");
  });

  test("onTokenの参照が変わってもwidgetは再生成されない（renderは1回のまま）", async () => {
    const onTokenA = vi.fn();
    const { rerender } = render(
      <TurnstileWidget siteKey="site_abc" onToken={onTokenA} />,
    );

    await waitFor(() => {
      expect(window.turnstile?.render).toHaveBeenCalledTimes(1);
    });

    const onTokenB = vi.fn();
    rerender(<TurnstileWidget siteKey="site_abc" onToken={onTokenB} />);

    expect(window.turnstile?.render).toHaveBeenCalledTimes(1);

    const [, options] = vi.mocked(window.turnstile!.render).mock.calls[0];
    options.callback("tok_after_rerender");

    expect(onTokenA).not.toHaveBeenCalled();
    expect(onTokenB).toHaveBeenCalledWith("tok_after_rerender");
  });
});
