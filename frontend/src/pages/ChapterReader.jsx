import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import { useChapterComments } from "../hooks/useChapterComments";
import { anchorMatchesText } from "../utils/textAnchors";
import ReaderParagraph from "../components/reader/ReaderParagraph";
import SelectionCommentAction from "../components/reader/SelectionCommentAction";
import ChapterCommentsPanel from "../components/reader/ChapterCommentsPanel";
import { MAX_CHAPTER_QUOTE_LENGTH } from "../components/reader/chapterReactions";
import "../styles/chapter-comments.css";

const NO_THREADS = [];

// Aviso para pantallas táctiles: explica que se comenta tocando una frase.
// Se oculta solo a los pocos segundos y vuelve en el siguiente capítulo
// hasta que la persona lo cierra o comenta por primera vez.
const TAP_HINT_KEY = "fribuk-reader-tap-hint";
const TAP_HINT_DURATION = 10000;

// Progreso de lectura: se guarda el párrafo que queda bajo esta línea de la
// pantalla (justo debajo de la barra de navegación), poco después de que
// la persona deja de desplazarse.
const READING_LINE = 110;
const PROGRESS_SCROLL_DELAY = 400;
const PROGRESS_SAVE_DELAY = 1500;

function shouldShowTapHint() {
  try {
    return (
      window.matchMedia("(hover: none), (pointer: coarse)").matches &&
      localStorage.getItem(TAP_HINT_KEY) !== "seen"
    );
  } catch {
    return false;
  }
}

function rememberTapHintSeen() {
  try {
    localStorage.setItem(TAP_HINT_KEY, "seen");
  } catch {
    // Sin almacenamiento, el aviso simplemente vuelve a aparecer.
  }
}

// Organiza los comentarios del capítulo por párrafo. Un comentario cuyo
// fragmento ya no coincide con el texto nunca se asigna a otro párrafo:
// pasa a la lista de comentarios de texto editado.
function organizeComments(comments, paragraphs) {
  const repliesByParent = new Map();
  const threadsByParagraph = new Map();
  const countByParagraph = new Map();
  const orphanThreads = [];

  for (const comment of comments) {
    if (!comment.parent_id) continue;
    if (!repliesByParent.has(comment.parent_id)) {
      repliesByParent.set(comment.parent_id, []);
    }
    repliesByParent.get(comment.parent_id).push(comment);
  }

  for (const comment of comments) {
    if (comment.parent_id) continue;

    const index = comment.paragraph_index;
    const isLocated =
      !comment.is_orphaned && anchorMatchesText(paragraphs[index], comment);

    if (!isLocated) {
      orphanThreads.push(comment);
      continue;
    }

    if (!threadsByParagraph.has(index)) threadsByParagraph.set(index, []);
    threadsByParagraph.get(index).push(comment);
    countByParagraph.set(
      index,
      (countByParagraph.get(index) || 0) +
        1 +
        (repliesByParent.get(comment.id)?.length || 0)
    );
  }

  for (const threads of threadsByParagraph.values()) {
    threads.sort((a, b) => a.start_offset - b.start_offset);
  }

  return { repliesByParent, threadsByParagraph, countByParagraph, orphanThreads };
}

export default function ChapterReader() {
  const { storyId, chapterId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [chapters, setChapters] = useState([]);
  const [chapter, setChapter] = useState(null);
  const [loading, setLoading] = useState(true);

  // Panel de comentarios abierto: un párrafo o la lista de texto editado.
  const [panelState, setPanelState] = useState(null);
  // Frase tocada en un teléfono, resaltada antes de comentarla.
  const [previewState, setPreviewState] = useState(null);
  const [tapHintEnabled, setTapHintEnabled] = useState(shouldShowTapHint);
  // Capítulo en el que el aviso táctil ya se ocultó por tiempo.
  const [tapHintExpiredFor, setTapHintExpiredFor] = useState(null);
  const textRef = useRef(null);

  useEffect(() => {
    api
      .get(`/stories/${storyId}/chapters`)
      .then((response) => {
        const data = response.data;

        setChapters(data);

        const currentIndex = data.findIndex(
          (item) => item.id === chapterId
        );

        if (currentIndex !== -1) {
          setChapter(data[currentIndex]);
        } else {
          setChapter(null);
        }
      })
      .finally(() => setLoading(false));
  }, [storyId, chapterId]);

  // Solo los capítulos publicados admiten comentarios.
  const commentsEnabled =
    chapter?.id === chapterId && chapter?.status === "published";

  const commentActions = useChapterComments(chapterId, commentsEnabled, user?.id);
  const { comments, createComment } = commentActions;

  const paragraphs = useMemo(
    () => (chapter?.content ? chapter.content.split("\n") : []),
    [chapter]
  );

  const { repliesByParent, threadsByParagraph, countByParagraph, orphanThreads } =
    useMemo(() => organizeComments(comments, paragraphs), [comments, paragraphs]);

  // El progreso solo se guarda para lectores con sesión y capítulos publicados.
  const tracksProgress = Boolean(user) && commentsEnabled;
  // Capítulo cuyo punto guardado ya se consultó: recién entonces se empieza
  // a guardar, para no pisar el progreso anterior antes de retomarlo.
  const [progressReadyFor, setProgressReadyFor] = useState(null);

  useEffect(() => {
    if (!tracksProgress) return undefined;

    let isActive = true;

    api
      .get(`/stories/${storyId}/progress`)
      .then((response) => {
        const saved = response.data.progress;
        if (!isActive || saved?.chapter_id !== chapterId) return;
        if (!(saved.paragraph_index > 0)) return;

        const paragraph = textRef.current
          ?.querySelector(`[data-paragraph-index="${saved.paragraph_index}"]`)
          ?.closest("p");
        if (!paragraph) return;

        paragraph.scrollIntoView({ block: "start" });
        showToast("Retomaste la lectura donde la dejaste.");
      })
      .catch((error) => {
        console.error("Error al cargar el progreso de lectura:", error);
      })
      .finally(() => {
        if (isActive) setProgressReadyFor(chapterId);
      });

    return () => {
      isActive = false;
    };
  }, [tracksProgress, storyId, chapterId, showToast]);

  useEffect(() => {
    if (!tracksProgress || progressReadyFor !== chapterId) return undefined;

    let lastSaved = null;
    let pending = null;
    let saveTimer = null;
    let scrollTimer = null;

    // Primer párrafo que sigue visible bajo la línea de lectura.
    const readCurrentParagraph = () => {
      const nodes = textRef.current?.querySelectorAll(".reader-paragraph");
      if (!nodes?.length) return null;

      let low = 0;
      let high = nodes.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (nodes[middle].getBoundingClientRect().bottom > READING_LINE) {
          high = middle;
        } else {
          low = middle + 1;
        }
      }
      return low;
    };

    const save = () => {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (pending === null || pending === lastSaved) return;

      lastSaved = pending;
      api
        .put(`/stories/${storyId}/progress`, {
          chapter_id: chapterId,
          paragraph_index: pending,
        })
        .catch((error) => {
          console.error("Error al guardar el progreso de lectura:", error);
        });
    };

    const handleScroll = () => {
      if (scrollTimer) return;

      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        const current = readCurrentParagraph();
        if (current === null || current === pending) return;

        pending = current;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, PROGRESS_SAVE_DELAY);
      }, PROGRESS_SCROLL_DELAY);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") save();
    };

    // Abrir el capítulo ya lo deja como el punto donde va la lectura.
    pending = readCurrentParagraph();
    save();

    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimeout(scrollTimer);
      // Al salir se guarda lo último que se alcanzó a leer.
      save();
    };
  }, [tracksProgress, progressReadyFor, storyId, chapterId]);

  // El panel pertenece a un capítulo: al cambiar de capítulo se cierra.
  const panel = panelState?.chapterId === chapterId ? panelState : null;
  const activeIndex = panel?.mode === "paragraph" ? panel.index : null;
  const draft = panel?.draft || null;
  const activeThreads =
    panel?.mode === "orphans"
      ? orphanThreads
      : threadsByParagraph.get(activeIndex) || NO_THREADS;

  // Fragmentos resaltados en el párrafo abierto.
  const activeRanges = useMemo(() => {
    if (activeIndex === null) return null;

    const ranges = activeThreads.map((thread) => ({
      start: thread.start_offset,
      end: thread.end_offset,
    }));
    if (draft) ranges.push({ start: draft.startOffset, end: draft.endOffset });

    return ranges;
  }, [activeIndex, activeThreads, draft]);

  const preview =
    previewState?.chapterId === chapterId ? previewState.anchor : null;
  const previewIndex = preview ? preview.paragraphIndex : null;

  const previewRanges = useMemo(() => {
    if (!preview) return null;

    const range = { start: preview.startOffset, end: preview.endOffset };
    return previewIndex === activeIndex && activeRanges
      ? [...activeRanges, range]
      : [range];
  }, [preview, previewIndex, activeIndex, activeRanges]);

  const dismissTapHint = useCallback(() => {
    setTapHintEnabled(false);
    rememberTapHintSeen();
  }, []);

  const showPreview = useCallback((anchor) => {
    setPreviewState(anchor ? { chapterId, anchor } : null);
    // Quien ya tocó una frase no necesita el aviso.
    if (anchor) dismissTapHint();
  }, [chapterId, dismissTapHint]);

  const tapHintVisible =
    tapHintEnabled &&
    commentsEnabled &&
    tapHintExpiredFor !== chapterId &&
    !preview &&
    !panel;

  useEffect(() => {
    if (!tapHintVisible) return undefined;

    const timer = setTimeout(
      () => setTapHintExpiredFor(chapterId),
      TAP_HINT_DURATION
    );
    return () => clearTimeout(timer);
  }, [tapHintVisible, chapterId]);

  const focusIndicator = useCallback((index) => {
    if (index === null || index === undefined) return;
    document
      .querySelector(`[data-comment-indicator="${index}"]`)
      ?.focus({ preventScroll: true });
  }, []);

  const scrollToParagraph = useCallback((index) => {
    requestAnimationFrame(() => {
      const paragraph = textRef.current
        ?.querySelector(`[data-paragraph-index="${index}"]`)
        ?.closest("p");
      if (!paragraph) return;

      // En escritorio el panel va al costado; en móvil cubre la parte
      // baja de la pantalla, así que el párrafo se lleva arriba.
      const sidePanel = window.matchMedia("(min-width: 1100px)").matches;
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      paragraph.scrollIntoView({
        block: sidePanel ? "nearest" : "start",
        behavior: reducedMotion ? "auto" : "smooth",
      });
    });
  }, []);

  // Se lee desde una referencia para que abrir un párrafo no obligue a
  // volver a dibujar todos los demás.
  const panelRef = useRef(null);
  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);

  const openParagraph = useCallback((index) => {
    const current = panelRef.current;
    const isOpen =
      current?.mode === "paragraph" && current.index === index && !current.draft;

    // Pulsar el indicador del párrafo abierto cierra el panel.
    if (isOpen) {
      setPanelState(null);
      return;
    }

    setPanelState({ chapterId, mode: "paragraph", index, draft: null });
    scrollToParagraph(index);
  }, [chapterId, scrollToParagraph]);

  const startComment = useCallback((anchor) => {
    if (Array.from(anchor.quote).length > MAX_CHAPTER_QUOTE_LENGTH) {
      showToast(
        `Selecciona un fragmento más corto (máximo ${MAX_CHAPTER_QUOTE_LENGTH} caracteres).`,
        "error"
      );
      return;
    }

    setPanelState({
      chapterId,
      mode: "paragraph",
      index: anchor.paragraphIndex,
      draft: anchor,
    });
    scrollToParagraph(anchor.paragraphIndex);
  }, [chapterId, scrollToParagraph, showToast]);

  const closePanel = useCallback(() => {
    setPanelState(null);
    focusIndicator(activeIndex);
  }, [activeIndex, focusIndicator]);

  const cancelDraft = useCallback(() => {
    setPanelState((current) => {
      if (!current) return null;
      // Sin comentarios previos no queda nada que mostrar en el panel.
      return threadsByParagraph.has(current.index)
        ? { ...current, draft: null }
        : null;
    });
  }, [threadsByParagraph]);

  const submitDraft = useCallback(async (content) => {
    if (!draft) return;

    // El comentario y su indicador aparecen al instante: no hace falta
    // un aviso que tape el panel.
    await createComment(draft, content);
    setPanelState((current) => (current ? { ...current, draft: null } : current));
  }, [draft, createComment]);

  if (loading) {
    return (
      <main className="reader-page">
        <p className="loading-text">Cargando capítulo...</p>
      </main>
    );
  }

  if (!chapter) {
    return (
      <main className="reader-page">
        <div className="reader-error">
          <div className="empty-icon">✦</div>

          <h2>No pudimos encontrar este capítulo</h2>

          <p>
            El capítulo que buscas no está disponible.
          </p>

          <Link
            to={`/stories/${storyId}`}
            className="reader-back-button"
          >
            Volver a la historia
          </Link>
        </div>
      </main>
    );
  }

  const currentIndex = chapters.findIndex(
    (item) => item.id === chapterId
  );

  const previousChapter =
    currentIndex > 0
      ? chapters[currentIndex - 1]
      : null;

  const nextChapter =
    currentIndex < chapters.length - 1
      ? chapters[currentIndex + 1]
      : null;

  const orphanCount = orphanThreads.reduce(
    (sum, thread) => sum + 1 + (repliesByParent.get(thread.id)?.length || 0),
    0
  );

  return (
    <main className={`reader-page${panel ? " has-comments-panel" : ""}`}>

      {/* Barra superior */}
      <div className="reader-topbar">

        <Link
          to={`/stories/${storyId}`}
          className="reader-back-link"
        >
          ← Volver a la historia
        </Link>

        <span className="reader-brand">
          FriBuk
        </span>

      </div>

      {/* Contenido */}
      <article className="reader-content">

        <header className="reader-header">

          <p className="reader-chapter-number">
            CAPÍTULO {currentIndex + 1} DE {chapters.length}
          </p>

          <h1>
            {chapter.title}
          </h1>

        </header>

        <div className="reader-divider">
          <span>✦</span>
        </div>

        {/* Texto */}
        <div className="reader-text-area">
          <div className="reader-text" ref={textRef}>
            {paragraphs.map((paragraph, index) => (
              <ReaderParagraph
                key={index}
                index={index}
                text={paragraph}
                count={countByParagraph.get(index) || 0}
                isActive={index === activeIndex}
                ranges={
                  index === previewIndex
                    ? previewRanges
                    : index === activeIndex
                    ? activeRanges
                    : null
                }
                onOpen={openParagraph}
              />
            ))}
          </div>

          {commentsEnabled && (
            <SelectionCommentAction
              containerRef={textRef}
              isAuthenticated={Boolean(user)}
              onComment={startComment}
              onPreview={showPreview}
            />
          )}

          {tapHintVisible && (
            <div className="reader-tap-hint" role="status">
              <span aria-hidden="true">💬</span>
              <p>Toca una frase para comentarla</p>
              <button
                type="button"
                onClick={dismissTapHint}
                aria-label="Cerrar aviso"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          )}
        </div>

        {/* Comentarios */}
        {commentsEnabled && (
          <div className="reader-comments-footer">
            <p className="reader-comments-hint">
              <span className="reader-comments-hint-mouse">
                Selecciona una parte del texto para comentarla.
              </span>
              <span className="reader-comments-hint-touch">
                Toca una frase para comentarla, o mantén presionado para
                elegir un fragmento exacto.
              </span>
            </p>

            {orphanCount > 0 && (
              <button
                type="button"
                className="reader-orphans-button"
                onClick={() => setPanelState(
                  panel?.mode === "orphans"
                    ? null
                    : { chapterId, mode: "orphans", index: null, draft: null }
                )}
                aria-expanded={panel?.mode === "orphans"}
              >
                <span aria-hidden="true">💬</span>
                {orphanCount === 1
                  ? "1 comentario sobre texto editado"
                  : `${orphanCount} comentarios sobre texto editado`}
              </button>
            )}
          </div>
        )}

        {/* Navegación */}
        <nav className="chapter-navigation">

          {previousChapter ? (
            <Link
              to={`/stories/${storyId}/chapters/${previousChapter.id}`}
              className="chapter-nav-button previous"
            >
              <span className="chapter-nav-arrow">
                ←
              </span>

              <span className="chapter-nav-text">
                <small>ANTERIOR</small>
                {previousChapter.title}
              </span>
            </Link>
          ) : (
            <div />
          )}

          {nextChapter ? (
            <Link
              to={`/stories/${storyId}/chapters/${nextChapter.id}`}
              className="chapter-nav-button next"
            >
              <span className="chapter-nav-text">
                <small>SIGUIENTE</small>
                {nextChapter.title}
              </span>

              <span className="chapter-nav-arrow">
                →
              </span>
            </Link>
          ) : (
            <div />
          )}

        </nav>

        {/* Fin */}
        <footer className="reader-footer">

          <Link
            to={`/stories/${storyId}`}
            className="reader-story-link"
          >
            ← Ver todos los capítulos
          </Link>

          <div className="reader-finish">
            <span>Fin del capítulo</span>
            <span>✦</span>
          </div>

        </footer>

      </article>

      {panel && (
        <ChapterCommentsPanel
          mode={panel.mode}
          threads={activeThreads}
          repliesByParent={repliesByParent}
          draft={draft}
          isAuthenticated={Boolean(user)}
          actions={commentActions}
          onSubmitDraft={submitDraft}
          onCancelDraft={cancelDraft}
          onClose={closePanel}
        />
      )}

    </main>
  );
}
