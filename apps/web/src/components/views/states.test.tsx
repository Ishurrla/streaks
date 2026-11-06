// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadingCards } from "./states";

afterEach(cleanup);

describe("LoadingCards", () => {
  it("is a status named Loading, with one placeholder per card", () => {
    render(<LoadingCards count={2} />);
    const status = screen.getByRole("status", { name: "Loading" });
    expect(status.tagName).toBe("OUTPUT");
    expect(status.children).toHaveLength(2);
  });

  it("shows three placeholders by default", () => {
    render(<LoadingCards />);
    expect(screen.getByRole("status", { name: "Loading" }).children).toHaveLength(3);
  });
});
