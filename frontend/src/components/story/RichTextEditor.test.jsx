import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/react";
import RichTextEditor from "./RichTextEditor";
import { editorExtensions } from "./editorExtensions";
import { docToText } from "../../utils/richTextDoc";

function renderEditor(value, props = {}) {
  const onChange = vi.fn();
  const view = render(
    <RichTextEditor id="texto" ariaLabel="Texto del capítulo" value={value} onChange={onChange} {...props} />
  );
  return { onChange, ...view };
}

const lastValue = (onChange) => onChange.mock.calls.at(-1)?.[0];

describe("RichTextEditor", () => {
  it("muestra el texto guardado con su formato, sin marcas", async () => {
    renderEditor("[centro]**Título**\nUn __lugar__ y *algo*.\n[#]uno\n[#]dos");

    const content = await screen.findByRole("textbox", { name: "Texto del capítulo" });
    await waitFor(() => expect(content.querySelector("strong")?.textContent).toBe("Título"));

    expect(content.querySelector("p").style.textAlign).toBe("center");
    expect(content.querySelector("u").textContent).toBe("lugar");
    expect(content.querySelector("em").textContent).toBe("algo");
    expect(content.querySelectorAll("ol li")).toHaveLength(2);
    expect(content.textContent).not.toMatch(/[*_[\]#]/);
  });

  it("los botones cambian el formato y se guarda con marcas", async () => {
    const { onChange } = renderEditor("Hola");
    await screen.findByRole("textbox", { name: "Texto del capítulo" });

    fireEvent.click(screen.getByRole("button", { name: "Centrar" }));
    expect(lastValue(onChange)).toBe("[centro]Hola");
    expect(screen.getByRole("button", { name: "Centrar" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Lista numerada" }));
    expect(lastValue(onChange)).toBe("[centro][#]Hola");

    fireEvent.click(screen.getByRole("button", { name: "Viñetas" }));
    expect(lastValue(onChange)).toBe("[centro][•]Hola");

    fireEvent.click(screen.getByRole("button", { name: "Justificar" }));
    expect(lastValue(onChange)).toBe("[justificado][•]Hola");

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(lastValue(onChange)).toBe("[centro][•]Hola");
  });

  it("no deja pasar del límite de caracteres, contado como se guarda", async () => {
    const { onChange } = renderEditor("12345678", { maxLength: 10 });
    await screen.findByRole("textbox", { name: "Texto del capítulo" });

    // «[centro]12345678» ocuparía 16.
    fireEvent.click(screen.getByRole("button", { name: "Centrar" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Centrar" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("al pegar conserva el formato que se puede guardar", () => {
    const pasted = (html) => {
      const editor = new Editor({ extensions: editorExtensions(), content: "" });
      editor.commands.insertContent(html);
      const text = docToText(editor.getJSON());
      editor.destroy();
      return text;
    };

    // Google Docs: el formato va en estilos.
    expect(
      pasted(
        '<p style="text-align:center"><span style="font-weight:700">Título</span></p>' +
          '<p><span style="font-style:italic">cur</span> y ' +
          '<span style="text-decoration:underline">sub</span></p>' +
          "<ul><li><p>uno</p></li><li><p>dos</p></li></ul>"
      )
    ).toBe("[centro]**Título**\n*cur* y __sub__\n[•]uno\n[•]dos");

    // Word: etiquetas clásicas, y lo que no se puede guardar queda como texto.
    expect(
      pasted(
        "<h1>Encabezado</h1>" +
          "<p class=MsoNormal align=right style='text-align:right'><b>Fin</b></p>" +
          "<blockquote>Cita</blockquote><ol><li>uno</li></ol>"
      )
    ).toBe("Encabezado\n[derecha]**Fin**\nCita\n[#]uno");
  });

  it("carga el texto si llega después (por ejemplo, al editar)", async () => {
    const { rerender, onChange } = renderEditor("");
    const content = await screen.findByRole("textbox", { name: "Texto del capítulo" });

    rerender(
      <RichTextEditor id="texto" ariaLabel="Texto del capítulo" value="**Ya cargó**" onChange={onChange} />
    );

    await waitFor(() => expect(content.querySelector("strong")?.textContent).toBe("Ya cargó"));
    // Cargar no cuenta como un cambio de quien escribe.
    expect(onChange).not.toHaveBeenCalled();
  });
});
