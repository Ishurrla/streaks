// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DayPicker, daysSummary } from "./day-picker";

afterEach(cleanup);

function Picker({ start = [0, 1, 2, 3, 4, 5, 6], changing = false }: { start?: number[]; changing?: boolean }) {
  const [days, setDays] = useState(start);
  return <DayPicker days={days} onChange={setDays} color="#13795B" changing={changing} />;
}

const pill = (name: string) => screen.getByRole("button", { name });
const pressed = (el: HTMLElement) => el.getAttribute("aria-pressed");

describe("DayPicker", () => {
  it("labels each pill with the full day name and marks the chosen ones", () => {
    render(<Picker start={[0, 2, 4]} />);
    expect(pressed(pill("Monday"))).toBe("true");
    expect(pressed(pill("Tuesday"))).toBe("false");
    expect(pressed(pill("Friday"))).toBe("true");
    expect(screen.getByText("3 days a week · Mon · Wed · Fri")).toBeTruthy();
  });

  it("toggles days and follows the quick picks", () => {
    render(<Picker />);
    expect(pressed(pill("Every day"))).toBe("true");

    fireEvent.click(pill("Weekdays"));
    expect(pressed(pill("Weekdays"))).toBe("true");
    expect(pressed(pill("Saturday"))).toBe("false");
    expect(screen.getByText("5 days a week · Weekdays")).toBeTruthy();

    fireEvent.click(pill("Saturday"));
    expect(pressed(pill("Weekdays"))).toBe("false");
    expect(screen.getByText("6 days a week · Mon · Tue · Wed · Thu · Fri · Sat")).toBeTruthy();

    fireEvent.click(pill("Weekends"));
    expect(screen.getByText("2 days a week · Weekends")).toBeTruthy();
  });

  it("says to pick at least one day when none are chosen", () => {
    render(<Picker start={[3]} />);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(pill("Thursday"));
    expect(screen.getByRole("alert").textContent).toBe("Pick at least one day.");
  });

  it("mentions that changes start tomorrow only for an existing habit", () => {
    const { unmount } = render(<Picker />);
    expect(screen.queryByText(/Changes start tomorrow/)).toBeNull();
    unmount();
    render(<Picker changing />);
    expect(screen.getByText(/Rest days never break your streak\. Changes start tomorrow, so today's streak stays fair\./)).toBeTruthy();
  });
});

describe("daysSummary", () => {
  it("reads like the prototype", () => {
    expect(daysSummary([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(daysSummary([6])).toBe("1 day a week · Sun");
  });
});
