import { describe, expect, it } from "vitest";
import {
  PRIVATE_MESSAGE_MAX_LENGTH,
  apiErrorDetail,
  formatDayLabel,
  formatUnreadCount,
  groupMessagesByDay,
  messageTextError,
} from "./messages";

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

describe("messageTextError", () => {
  it("rechaza mensajes vacíos o solo con espacios", () => {
    for (const value of ["", "   ", "\n\t", ZERO_WIDTH_SPACE.repeat(3), null]) {
      expect(messageTextError(value, 100)).not.toBe("");
    }
  });

  it("acepta texto normal y emojis escritos como texto", () => {
    expect(messageTextError("Hola", 100)).toBe("");
    expect(messageTextError("Me encantó 💜🐉", 100)).toBe("");
  });

  it("aplica el límite de longitud", () => {
    const limit = PRIVATE_MESSAGE_MAX_LENGTH;

    expect(messageTextError("a".repeat(limit), limit)).toBe("");
    expect(messageTextError("a".repeat(limit + 1), limit)).toContain(String(limit));
    // Un emoji cuenta como un carácter, igual que en el backend.
    expect(messageTextError("🐉".repeat(5), 5)).toBe("");
  });
});

describe("formatUnreadCount", () => {
  it("no muestra nada sin mensajes y recorta los números grandes", () => {
    expect(formatUnreadCount(0)).toBe("");
    expect(formatUnreadCount(undefined)).toBe("");
    expect(formatUnreadCount(7)).toBe("7");
    expect(formatUnreadCount(250)).toBe("99+");
  });
});

describe("apiErrorDetail", () => {
  it("usa el detalle del backend y, si no hay, el texto de respaldo", () => {
    const error = { response: { data: { detail: "Esta persona no recibe mensajes privados." } } };

    expect(apiErrorDetail(error, "Respaldo")).toBe(
      "Esta persona no recibe mensajes privados."
    );
    expect(apiErrorDetail(new Error("red"), "Respaldo")).toBe("Respaldo");
    expect(apiErrorDetail({ response: { data: { detail: [{ msg: "x" }] } } }, "Respaldo")).toBe(
      "Respaldo"
    );
  });
});

describe("groupMessagesByDay", () => {
  it("agrupa por día y nombra hoy y ayer", () => {
    const now = new Date(2026, 9, 7, 15, 0);
    const today = new Date(2026, 9, 7, 9, 30).toISOString();
    const yesterday = new Date(2026, 9, 6, 22, 0).toISOString();

    const groups = groupMessagesByDay(
      [
        { id: "1", created_at: yesterday },
        { id: "2", created_at: today },
        { id: "3", created_at: today },
      ],
      now
    );

    expect(groups.map((group) => group.label)).toEqual(["Ayer", "Hoy"]);
    expect(groups[1].messages.map((message) => message.id)).toEqual(["2", "3"]);
    expect(formatDayLabel("no es una fecha", now)).toBe("");
  });
});
