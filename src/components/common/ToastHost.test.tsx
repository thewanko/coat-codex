import { describe, expect, test } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ToastHost from "./ToastHost";
import { useToast } from "./toastContext";

function Trigger() {
  const toast = useToast();
  return (
    <div>
      <button type="button" onClick={() => toast.success("saved")}>
        success
      </button>
      <button type="button" onClick={() => toast.error("failed")}>
        error
      </button>
    </div>
  );
}

describe("ToastHost", () => {
  test("renders children and an empty viewport initially", () => {
    render(
      <ToastHost>
        <div>content</div>
      </ToastHost>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  test("shows a success toast and auto-dismisses it", async () => {
    render(
      <ToastHost>
        <Trigger />
      </ToastHost>,
    );

    fireEvent.click(screen.getByRole("button", { name: "success" }));
    expect(screen.getByText("saved")).toBeInTheDocument();

    await waitFor(
      () => expect(screen.queryByText("saved")).not.toBeInTheDocument(),
      { timeout: 4000 },
    );
  });

  test("shows an error toast with manual dismiss button", () => {
    render(
      <ToastHost>
        <Trigger />
      </ToastHost>,
    );

    fireEvent.click(screen.getByRole("button", { name: "error" }));
    expect(screen.getByText("failed")).toBeInTheDocument();

    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    fireEvent.click(dismiss);
    expect(screen.queryByText("failed")).not.toBeInTheDocument();
  });
});
