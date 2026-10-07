import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { readSelectionAnchor, readSentenceAnchor } from "../../utils/textAnchors";
import { MAX_CHAPTER_QUOTE_LENGTH } from "./chapterReactions";

const SELECTION_DELAY = 180;
// Al tocar el botón en un teléfono la selección se pierde antes del clic:
// el botón se mantiene un momento para que el toque llegue.
const HIDE_DELAY = 400;
const ACTION_HEIGHT = 38;
const ACTION_GAP = 10;
// Un toque es breve y casi sin movimiento: así se distingue de desplazar
// la página o de mantener presionado para seleccionar.
const TAP_MAX_DURATION = 450;
const TAP_MAX_MOVE = 10;

// Acción "Comentar" que aparece al elegir texto del capítulo.
//
// Con ratón se selecciona el texto y la acción se ubica junto a la
// selección. En pantallas táctiles basta tocar una frase: queda resaltada
// (`onPreview`) y la acción se fija abajo. Mantener presionado para
// seleccionar un fragmento exacto sigue funcionando, y la acción queda
// lejos del menú nativo de copiar/buscar, que no se reemplaza ni se bloquea.
export default function SelectionCommentAction({
  containerRef,
  isAuthenticated,
  onComment,
  onPreview,
}) {
  const [action, setAction] = useState(null);
  const anchorRef = useRef(null);
  // Frase elegida con un toque, si la hay.
  const tapRef = useRef(null);
  const actionRef = useRef(null);

  useEffect(() => {
    let selectionTimer = null;
    let hideTimer = null;
    let tapStart = null;

    const hide = () => {
      anchorRef.current = null;
      setAction(null);
    };

    const clearTap = () => {
      if (!tapRef.current) return;
      tapRef.current = null;
      onPreview(null);
      hide();
    };

    const readSelection = () => {
      const container = containerRef.current;
      const anchor = readSelectionAnchor(container);

      if (!anchor) {
        // Una frase tocada no depende de la selección del navegador.
        if (tapRef.current) return;

        if (anchorRef.current && !hideTimer) {
          hideTimer = setTimeout(() => {
            hideTimer = null;
            hide();
          }, HIDE_DELAY);
        }
        return;
      }

      clearTimeout(hideTimer);
      hideTimer = null;

      // La selección manual reemplaza a la frase tocada.
      if (tapRef.current) {
        tapRef.current = null;
        onPreview(null);
      }
      anchorRef.current = anchor;

      const docked = !window.matchMedia(
        "(min-width: 900px) and (hover: hover) and (pointer: fine)"
      ).matches;

      if (docked) {
        setAction({ docked: true });
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const { rect } = anchor;
      // Sobre la selección; si queda fuera de la pantalla, debajo.
      const fitsAbove = rect.top > 96 + ACTION_HEIGHT + ACTION_GAP;
      const top = fitsAbove
        ? rect.top - containerRect.top - ACTION_HEIGHT - ACTION_GAP
        : rect.bottom - containerRect.top + ACTION_GAP;
      const center = rect.left + rect.width / 2 - containerRect.left;

      setAction({
        docked: false,
        top,
        left: Math.min(Math.max(center, 60), containerRect.width - 60),
      });
    };

    const handleSelectionChange = () => {
      clearTimeout(selectionTimer);
      selectionTimer = setTimeout(readSelection, SELECTION_DELAY);
    };

    const hasSelection = () => {
      const selection = window.getSelection ? window.getSelection() : null;
      return Boolean(selection && !selection.isCollapsed);
    };

    const handlePointerDown = (event) => {
      tapStart = null;

      const container = containerRef.current;
      if (!container || actionRef.current?.contains(event.target)) return;

      // Tocar fuera del texto suelta la frase elegida.
      if (!container.contains(event.target)) {
        clearTap();
        return;
      }

      if (event.pointerType === "mouse") return;

      tapStart = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
        // Ese toque solo deshace la selección que había.
        hadSelection: hasSelection(),
      };
    };

    const handlePointerUp = (event) => {
      const start = tapStart;
      tapStart = null;

      const container = containerRef.current;
      if (!container || !start || start.id !== event.pointerId) return;
      if (start.hadSelection || hasSelection()) return;
      if (event.timeStamp - start.time > TAP_MAX_DURATION) return;
      if (
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_MAX_MOVE
      ) {
        return;
      }

      const element =
        event.target instanceof Element
          ? event.target.closest("[data-paragraph-index]")
          : null;
      const anchor =
        element && container.contains(element)
          ? readSentenceAnchor(
              element,
              event.clientX,
              event.clientY,
              MAX_CHAPTER_QUOTE_LENGTH
            )
          : null;
      const current = tapRef.current;

      // Tocar un espacio vacío, o la misma frase otra vez, la suelta.
      if (
        !anchor ||
        (current &&
          current.paragraphIndex === anchor.paragraphIndex &&
          current.startOffset === anchor.startOffset &&
          current.endOffset === anchor.endOffset)
      ) {
        clearTap();
        return;
      }

      clearTimeout(hideTimer);
      hideTimer = null;
      tapRef.current = anchor;
      anchorRef.current = anchor;
      onPreview(anchor);
      setAction({ docked: true });
    };

    const handlePointerCancel = () => {
      tapStart = null;
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerCancel);
      clearTimeout(selectionTimer);
      clearTimeout(hideTimer);
      // Lo elegido pertenece al capítulo que se estaba leyendo.
      tapRef.current = null;
      anchorRef.current = null;
      setAction(null);
    };
  }, [containerRef, onPreview]);

  if (!action) return null;

  const handleComment = () => {
    const anchor = anchorRef.current;
    anchorRef.current = null;
    tapRef.current = null;
    setAction(null);
    onPreview(null);

    if (!anchor) return;

    const selection = window.getSelection ? window.getSelection() : null;
    if (selection) selection.removeAllRanges();

    onComment({
      paragraphIndex: anchor.paragraphIndex,
      startOffset: anchor.startOffset,
      endOffset: anchor.endOffset,
      quote: anchor.quote,
    });
  };

  return (
    <div
      ref={actionRef}
      className={`reader-selection-action${action.docked ? " is-docked" : ""}`}
      style={action.docked ? undefined : { top: action.top, left: action.left }}
    >
      {isAuthenticated ? (
        <button
          type="button"
          // Evita que el clic deshaga la selección antes de leerla.
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleComment}
        >
          <span aria-hidden="true">💬</span>
          Comentar
        </button>
      ) : (
        <Link to="/login" onMouseDown={(event) => event.preventDefault()}>
          Inicia sesión para comentar
        </Link>
      )}
    </div>
  );
}
