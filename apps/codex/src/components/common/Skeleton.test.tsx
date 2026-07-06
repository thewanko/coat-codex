import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Skeleton from "./Skeleton";

describe("Skeleton", () => {
  test("renders card variant with status role", () => {
    render(<Skeleton variant="card" />);
    const el = screen.getByRole("status");
    expect(el).toBeInTheDocument();
    expect(el.dataset.variant).toBe("card");
  });

  test("renders photo variant with status role", () => {
    render(<Skeleton variant="photo" aria-label="loading photo" />);
    const el = screen.getByRole("status", { name: "loading photo" });
    expect(el).toBeInTheDocument();
    expect(el.dataset.variant).toBe("photo");
  });
});
