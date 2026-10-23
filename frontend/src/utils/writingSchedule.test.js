import { describe, expect, it } from "vitest";
import { formatScheduleDays, formatScheduleHour } from "./writingSchedule";

describe("formatScheduleDays", () => {
  it("nombra los días en orden y en plural", () => {
    expect(formatScheduleDays([5, 1])).toBe("los martes y sábados");
    expect(formatScheduleDays([0, 2, 4])).toBe("los lunes, miércoles y viernes");
    expect(formatScheduleDays([6])).toBe("los domingos");
  });

  it("resume la semana completa", () => {
    expect(formatScheduleDays([0, 1, 2, 3, 4, 5, 6])).toBe("todos los días");
  });

  it("devuelve vacío sin días", () => {
    expect(formatScheduleDays([])).toBe("");
    expect(formatScheduleDays(undefined)).toBe("");
  });
});

describe("formatScheduleHour", () => {
  it("muestra la hora en punto con dos dígitos", () => {
    expect(formatScheduleHour(7)).toBe("07:00");
    expect(formatScheduleHour(19)).toBe("19:00");
  });
});
