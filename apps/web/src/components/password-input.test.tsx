// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PasswordInput } from "./password-input";

afterEach(cleanup);

/** A form that, like the real ones, bumps resetKey after a failed attempt. */
function Form() {
  const [value, setValue] = useState("");
  const [failures, setFailures] = useState(0);
  return (
    <>
      <label htmlFor="pw">Password</label>
      <PasswordInput id="pw" value={value} onChange={(e) => setValue(e.target.value)} resetKey={failures} />
      <button type="button" onClick={() => setFailures((n) => n + 1)}>
        Fail
      </button>
    </>
  );
}

const input = () => screen.getByLabelText("Password") as HTMLInputElement;
const toggle = () => screen.getByRole("button", { name: /password$/ });

describe("PasswordInput", () => {
  it("is hidden by default, with a Show password button", () => {
    render(<Form />);
    expect(input().type).toBe("password");
    expect(toggle().getAttribute("aria-label")).toBe("Show password");
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
  });

  it("shows and hides the password, keeping the value", () => {
    render(<Form />);
    fireEvent.change(input(), { target: { value: "hunter22" } });

    fireEvent.click(toggle());
    expect(input().type).toBe("text");
    expect(input().value).toBe("hunter22");
    expect(toggle().getAttribute("aria-label")).toBe("Hide password");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(toggle());
    expect(input().type).toBe("password");
    expect(input().value).toBe("hunter22");
  });

  it("keeps focus and the cursor position in the input", () => {
    render(<Form />);
    fireEvent.change(input(), { target: { value: "hunter22" } });
    input().focus();
    input().setSelectionRange(3, 3);

    // A mouse press on the button must not take focus from the input.
    expect(fireEvent.mouseDown(toggle())).toBe(false);
    fireEvent.click(toggle());

    expect(document.activeElement).toBe(input());
    expect(input().selectionStart).toBe(3);
    expect(input().selectionEnd).toBe(3);
  });

  it("is a real button, so Enter and Space work from the keyboard", () => {
    render(<Form />);
    expect(toggle().tagName).toBe("BUTTON");
    expect(toggle().getAttribute("type")).toBe("button");
  });

  it("hides the password again after a failed attempt", () => {
    render(<Form />);
    fireEvent.click(toggle());
    expect(input().type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Fail" }));
    expect(input().type).toBe("password");
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
  });
});
