import { describe, expect, it } from "vitest";
import { getNotificationContent } from "./notificationText";

const base = {
  type: "story_comment",
  story_id: "s1",
  actor: { id: "a1", username: "brity" },
};

describe("getNotificationContent", () => {
  it("una respuesta lleva directo a ese comentario", () => {
    const content = getNotificationContent({
      ...base,
      data: { chapter_id: "c1", chapter_title: "Uno", story_title: "Luna", reply: "own", comment_id: "r1" },
    });

    expect(content.text).toBe(" respondió tu comentario en «Uno», de «Luna».");
    expect(content.to).toBe("/stories/s1/chapters/c1?comentario=r1");
  });

  it("los comentarios y menciones también llevan al comentario", () => {
    expect(getNotificationContent({
      ...base, data: { chapter_id: "c1", comment_id: "x" },
    }).to).toBe("/stories/s1/chapters/c1?comentario=x");
    expect(getNotificationContent({
      ...base, data: { chapter_id: "c1", mention: true, comment_id: "y" },
    }).to).toBe("/stories/s1/chapters/c1?comentario=y");
  });

  it("los avisos de respuesta anteriores llevan al comentario respondido", () => {
    expect(getNotificationContent({
      ...base, data: { chapter_id: "c1", reply: "own", parent_id: "p1" },
    }).to).toBe("/stories/s1/chapters/c1?comentario=p1");
  });

  it("los avisos antiguos, sin id de comentario, llevan al capítulo", () => {
    expect(getNotificationContent({
      ...base, data: { chapter_id: "c1" },
    }).to).toBe("/stories/s1/chapters/c1");
  });
});
