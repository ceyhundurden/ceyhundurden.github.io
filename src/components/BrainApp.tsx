"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Graph, NodePatch } from "@/lib/types";
import { newId } from "@/lib/id";
import { buildIndex } from "@/engine/graph";
import { paletteColor } from "@/engine/color";
import * as ops from "@/lib/graph-ops";
import { clearToken, getToken, GitHubBackend, GitHubError, loadPublicGraph } from "@/lib/backend";
import BrainCanvas, { type CanvasApi } from "./BrainCanvas";
import Toolbar from "./Toolbar";
import NodePanel, { type SaveStatus as PanelSaveStatus } from "./NodePanel";
import CreatePopover from "./CreatePopover";
import EdgePopover from "./EdgePopover";
import Search from "./Search";
import SaveStatus, { type SaveState } from "./SaveStatus";
import styles from "./BrainApp.module.css";

type Loaded = { graph: Graph; backend: GitHubBackend | null; sha: string | null; notice: string | null };

/** Client-loaded shell: the static HTML only carries the loading state. */
export default function BrainApp() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getToken();
      let notice: string | null = null;
      if (token) {
        const backend = new GitHubBackend(token);
        try {
          await backend.verify();
          const { graph, sha } = await backend.load();
          if (!cancelled) setLoaded({ graph, backend, sha, notice: null });
          return;
        } catch (e) {
          if (e instanceof GitHubError && e.tokenInvalid) {
            clearToken();
            notice = `Giriş geçersiz: ${e.message}. Tekrar giriş yap.`;
          } else {
            const msg = e instanceof Error ? e.message : "bilinmeyen hata";
            notice = `Düzenleme modu açılamadı (${msg}); salt okunur gösteriliyor.`;
          }
        }
      }
      try {
        const graph = await loadPublicGraph();
        if (!cancelled) setLoaded({ graph, backend: null, sha: null, notice });
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "harita yüklenemedi");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (!loaded) {
    return (
      <main className={styles.root}>
        <div className={styles.brand} aria-hidden>
          <span className={styles.brandDot} />
          brain
        </div>
        <div className={styles.loading} role="status">
          {loadError ? (
            <>
              <p className={styles.emptyTitle}>Harita yüklenemedi</p>
              <p className={styles.emptySub}>{loadError}</p>
              <button
                type="button"
                className={styles.retry}
                onClick={() => {
                  setLoadError(null);
                  setAttempt((a) => a + 1);
                }}
              >
                Tekrar dene
              </button>
            </>
          ) : (
            <span className={styles.loadingDot} aria-label="Yükleniyor" />
          )}
        </div>
      </main>
    );
  }

  return <BrainWorkspace initialGraph={loaded.graph} backend={loaded.backend} initialSha={loaded.sha} notice={loaded.notice} />;
}

interface Props {
  initialGraph: Graph;
  backend: GitHubBackend | null;
  initialSha: string | null;
  notice: string | null;
}

type CreateState = { mode: "main"; wx: number; wy: number } | { mode: "sub"; wx: number; wy: number; parentId: string };
type Toast = { id: string; text: string; kind: "info" | "error" };

const SAVE_DEBOUNCE_MS = 3000;
const SAVED_VISIBLE_MS = 8000;
const EDIT_KEY = "brain.editMode";

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
}

function short(s: string, max = 40) {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function BrainWorkspace({ initialGraph, backend: initialBackend, initialSha, notice }: Props) {
  const [graph, setGraphState] = useState<Graph>(initialGraph);
  const [admin, setAdmin] = useState(!!initialBackend);
  const [editMode, setEditModeState] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [edgePop, setEdgePop] = useState<{ id: string; wx: number; wy: number } | null>(null);
  const [create, setCreate] = useState<CreateState | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [vw, setVw] = useState(1280);
  const apiRef = useRef<CanvasApi | null>(null);

  // The working copy lives in a ref too, updated synchronously, so the saver always
  // commits exactly what the user sees.
  const graphRef = useRef(graph);
  const setGraph = useCallback((next: Graph) => {
    graphRef.current = next;
    setGraphState(next);
  }, []);

  const index = useMemo(() => buildIndex(graph), [graph]);
  const selectedNode = selectedNodeId ? index.byId.get(selectedNodeId) ?? null : null;
  const editing = admin && editMode;

  const panelWidthFor = useCallback((open: boolean) => (open ? (vw < 720 ? vw : Math.min(420, Math.round(vw * 0.36))) : 0), [vw]);
  const panelWidth = panelWidthFor(!!selectedNode);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // restore edit mode preference for the admin
  useEffect(() => {
    if (!admin) return;
    try {
      if (localStorage.getItem(EDIT_KEY) === "1") setEditModeState(true);
    } catch {
      /* storage unavailable */
    }
  }, [admin]);

  const setEditMode = useCallback((on: boolean) => {
    setEditModeState(on);
    try {
      localStorage.setItem(EDIT_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  // ---- toasts ----
  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = newId(6);
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const noticeShown = useRef(false);
  useEffect(() => {
    if (!notice || noticeShown.current) return;
    noticeShown.current = true;
    toast(notice, "error");
  }, [notice, toast]);

  const fail = useCallback(
    (e: unknown, fallback = "İşlem başarısız oldu") => {
      const detail = e instanceof Error && e.message ? e.message : "";
      toast(detail ? `${fallback}: ${detail}` : fallback, "error");
    },
    [toast],
  );

  // ---- saving: whole graph, debounced, never two PUTs in flight ----
  const backendRef = useRef<GitHubBackend | null>(initialBackend);
  const shaRef = useRef<string | null>(initialSha);
  const lastSavedRef = useRef<Graph>(initialGraph);
  const lastSavedJsonRef = useRef<string>(ops.serializeGraph(initialGraph));
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryRef = useRef("güncelleme");

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const runSave = useCallback(async () => {
    clearTimer();
    const backend = backendRef.current;
    if (!backend || savingRef.current) return; // an in-flight save re-checks when it finishes
    if (savedVersionRef.current === versionRef.current) return;
    const version = versionRef.current;
    const summary = summaryRef.current;
    savingRef.current = true;
    setSaveState("saving");
    setSaveError(null);
    let ok = false;
    try {
      const prepared = ops.prepareForSave(graphRef.current, lastSavedRef.current);
      const json = ops.serializeGraph(prepared);
      if (json !== lastSavedJsonRef.current) {
        shaRef.current = await backend.save(prepared, shaRef.current, `brain: ${summary}`);
        lastSavedJsonRef.current = json;
        lastSavedRef.current = prepared;
      }
      savedVersionRef.current = version;
      ok = true;
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error && e.message ? e.message : "bilinmeyen hata");
    } finally {
      savingRef.current = false;
    }
    if (!ok) return; // keep local state + dirty flag; user retries (or keeps editing)
    if (savedVersionRef.current !== versionRef.current) {
      setSaveState("dirty");
      // changes arrived while saving and their debounce already fired → go again now
      if (!timerRef.current) void runSave();
    } else {
      setSaveState("saved");
    }
  }, [clearTimer]);

  const markDirty = useCallback(
    (summary: string) => {
      versionRef.current++;
      summaryRef.current = summary;
      if (!savingRef.current) setSaveState("dirty");
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void runSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [clearTimer, runSave],
  );

  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState((s) => (s === "saved" ? "clean" : s)), SAVED_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [saveState]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (savingRef.current || savedVersionRef.current !== versionRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  // ---- selection + camera + URL hash ----
  const selectNode = useCallback(
    (id: string | null, fly = true) => {
      setSelectedNodeId(id);
      setEdgePop(null);
      if (id) {
        if (fly) apiRef.current?.flyToNode(id, panelWidthFor(true));
        if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
      } else if (location.hash) {
        history.replaceState(null, "", location.pathname + location.search);
      }
    },
    [panelWidthFor],
  );

  const onCanvasReady = useCallback(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    const api = apiRef.current;
    if (!api) return;
    const deepLinked = id && graphRef.current.nodes.some((n) => n.id === id);
    if (deepLinked) setSelectedNodeId(id);
    api.scene.whenSized(() => {
      if (deepLinked) api.flyToNode(id, panelWidthFor(true));
      else if (graphRef.current.nodes.length > 0) api.zoomToFit(0);
    });
    // only on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (id && graphRef.current.nodes.some((n) => n.id === id)) selectNode(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [selectNode]);

  // ---- mutations (local, instant; the saver commits later) ----
  const patchNode = useCallback(
    (id: string, patch: NodePatch) => {
      try {
        const next = ops.applyNodeDraft(graphRef.current, id, patch);
        setGraph(next);
        const title = next.nodes.find((n) => n.id === id)?.title.trim();
        markDirty(`“${short(title || "modül")}” düzenlendi`);
      } catch (e) {
        fail(e, "Değişiklik uygulanamadı");
      }
    },
    [fail, markDirty, setGraph],
  );

  const createNode = useCallback(
    (c: CreateState, title: string) => {
      setCreate(null);
      const mainCount = graphRef.current.nodes.filter((n) => n.kind === "main").length;
      try {
        const { graph: next, node } = ops.createNode(graphRef.current, {
          kind: c.mode,
          title,
          x: Math.round(c.wx),
          y: Math.round(c.wy),
          color: c.mode === "main" ? paletteColor(mainCount) : undefined,
          parentId: c.mode === "sub" ? c.parentId : undefined,
        });
        setGraph(next);
        markDirty(`yeni ${c.mode === "main" ? "ana" : "alt"} modül “${short(node.title)}”`);
        setSelectedNodeId(node.id);
        history.replaceState(null, "", `#${node.id}`);
        // keep the new node visible next to the panel without a big jump
        apiRef.current?.flyToNode(node, panelWidthFor(true));
      } catch (e) {
        fail(e, "Modül oluşturulamadı");
      }
    },
    [fail, markDirty, panelWidthFor, setGraph],
  );

  const deleteNode = useCallback(
    (id: string) => {
      const n = graphRef.current.nodes.find((x) => x.id === id);
      if (!n) return;
      if (!window.confirm(`“${n.title}” modülü ve tüm bağlantıları silinsin mi?`)) return;
      try {
        setGraph(ops.deleteNode(graphRef.current, id).graph);
        markDirty(`“${short(n.title)}” silindi`);
        if (selectedNodeId === id) selectNode(null, false);
      } catch (e) {
        fail(e, "Silinemedi");
      }
    },
    [fail, markDirty, selectNode, selectedNodeId, setGraph],
  );

  const createLink = useCallback(
    (source: string, target: string) => {
      try {
        setGraph(ops.createEdge(graphRef.current, { source, target, kind: "link" }).graph);
        const t = (id: string) => short(graphRef.current.nodes.find((n) => n.id === id)?.title ?? "?", 24);
        markDirty(`bağıntı “${t(source)}” → “${t(target)}”`);
      } catch (e) {
        if (e instanceof ops.ConflictError) toast("Bu iki modül zaten bağlı.");
        else fail(e, "Bağlantı kurulamadı");
      }
    },
    [fail, markDirty, setGraph, toast],
  );

  const updateEdgeLabel = useCallback(
    (id: string, label: string) => {
      try {
        const before = graphRef.current.edges.find((e) => e.id === id)?.label ?? "";
        const { graph: next, edge } = ops.updateEdge(graphRef.current, id, { label });
        if ((edge.label ?? "") === before) return;
        setGraph(next);
        markDirty(edge.label ? `bağlantı etiketi “${short(edge.label)}”` : "bağlantı etiketi kaldırıldı");
      } catch (e) {
        fail(e, "Etiket kaydedilemedi");
      }
    },
    [fail, markDirty, setGraph],
  );

  const deleteEdge = useCallback(
    (id: string, ask: boolean) => {
      if (ask && !window.confirm("Bu bağlantı silinsin mi?")) return;
      setEdgePop(null);
      try {
        setGraph(ops.deleteEdge(graphRef.current, id).graph);
        markDirty("bağlantı silindi");
      } catch (e) {
        fail(e, "Bağlantı silinemedi");
      }
    },
    [fail, markDirty, setGraph],
  );

  /** Called by the canvas on drop only; live drag positions stay inside the canvas. */
  const moveNode = useCallback(
    (id: string, x: number, y: number) => {
      try {
        const { graph: next, node } = ops.updateNode(graphRef.current, id, { x, y });
        setGraph(next);
        markDirty(`“${short(node.title)}” taşındı`);
      } catch (e) {
        fail(e, "Konum kaydedilemedi");
      }
    },
    [fail, markDirty, setGraph],
  );

  const logout = useCallback(async () => {
    const unsaved = () => savedVersionRef.current !== versionRef.current;
    const settle = async () => {
      while (savingRef.current) await new Promise((r) => setTimeout(r, 100));
    };
    if (unsaved() || savingRef.current) {
      await settle();
      await runSave();
      await settle();
      if (unsaved()) {
        if (!window.confirm("Kaydedilmemiş değişiklikler var. Yine de çıkış yapılsın mı? (Bu değişiklikler kaybolur.)")) return;
      }
    }
    clearTimer();
    clearToken();
    backendRef.current = null;
    savedVersionRef.current = versionRef.current;
    setAdmin(false);
    setEditModeState(false);
    setSaveState("clean");
    setSaveError(null);
    toast("Çıkış yapıldı.");
  }, [clearTimer, runSave, toast]);

  // ---- canvas callbacks ----
  const onEmptyClick = useCallback(
    (wx: number, wy: number) => {
      if (create || edgePop) {
        setCreate(null);
        setEdgePop(null);
        return;
      }
      if (editing) {
        setCreate({ mode: "main", wx, wy });
        if (selectedNodeId) selectNode(null, false);
      } else if (selectedNodeId) {
        selectNode(null, false);
      }
    },
    [create, edgePop, editing, selectedNodeId, selectNode],
  );

  const onDropSub = useCallback((parentId: string, wx: number, wy: number) => {
    setEdgePop(null);
    setCreate({ mode: "sub", wx, wy, parentId });
  }, []);

  const onEdgeClick = useCallback((id: string, wx: number, wy: number) => {
    setCreate(null);
    setEdgePop({ id, wx, wy });
  }, []);

  const onSelectFromCanvas = useCallback(
    (id: string | null) => {
      setCreate(null);
      selectNode(id);
    },
    [selectNode],
  );

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "s" || e.key === "S")) {
        if (!admin) return;
        e.preventDefault();
        void runSave();
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "Escape") {
        if (create) setCreate(null);
        else if (edgePop) setEdgePop(null);
        else if (searchOpen) setSearchOpen(false);
        else if (selectedNodeId) selectNode(null, false);
      } else if (e.key === "Delete" && editing) {
        if (edgePop) deleteEdge(edgePop.id, true);
        else if (selectedNodeId) deleteNode(selectedNodeId);
      } else if ((e.key === "e" || e.key === "E") && admin && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setEditMode(!editMode);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [admin, create, deleteEdge, deleteNode, edgePop, editMode, editing, runSave, searchOpen, selectNode, selectedNodeId, setEditMode]);

  // leaving edit mode closes edit-only UI
  useEffect(() => {
    if (!editing) {
      setCreate(null);
      setEdgePop(null);
    }
  }, [editing]);

  const ghost = useMemo(
    () => (create ? { wx: create.wx, wy: create.wy, parentId: create.mode === "sub" ? create.parentId : null } : null),
    [create],
  );
  const edgeForPop = edgePop ? graph.edges.find((e) => e.id === edgePop.id) ?? null : null;
  const empty = graph.nodes.length === 0;
  const toolbarOffset = panelWidth < vw ? panelWidth : 0;
  const panelSaveStatus: PanelSaveStatus = saveState === "saving" ? "saving" : saveState === "error" ? "error" : saveState === "saved" ? "saved" : "idle";

  return (
    <main className={styles.root}>
      <BrainCanvas
        graph={graph}
        editMode={editing}
        selectedNodeId={selectedNodeId}
        selectedEdgeId={edgeForPop?.id ?? null}
        ghost={ghost}
        panelWidth={panelWidth}
        apiRef={apiRef}
        onReady={onCanvasReady}
        onSelectNode={onSelectFromCanvas}
        onEdgeClick={onEdgeClick}
        onEmptyClick={onEmptyClick}
        onDropSub={onDropSub}
        onLink={createLink}
        onMoveNode={moveNode}
      />

      <div className={styles.brand} aria-hidden>
        <span className={styles.brandDot} />
        brain
      </div>

      <Toolbar
        admin={admin}
        editMode={editMode}
        onToggleEdit={() => setEditMode(!editMode)}
        onZoomToFit={() => apiRef.current?.zoomToFit(panelWidth)}
        onSearch={() => setSearchOpen(true)}
        onLogout={() => void logout()}
        offsetRight={toolbarOffset}
      />

      {admin && <SaveStatus state={saveState} error={saveError} onRetry={() => void runSave()} offsetRight={toolbarOffset} />}

      {empty && !create && (
        <div className={styles.empty}>
          {editing ? (
            <>
              <p className={styles.emptyTitle}>Boşluğa tıkla ve ilk modülünü oluştur</p>
              <p className={styles.emptySub}>Sonra düğümün kenarındaki + tutamağını sürükleyerek alt modüller ekle.</p>
            </>
          ) : admin ? (
            <>
              <p className={styles.emptyTitle}>Henüz bomboş bir evren</p>
              <p className={styles.emptySub}>Sağ üstten düzenleme modunu aç ve ilk modülünü oluştur.</p>
            </>
          ) : (
            <>
              <p className={styles.emptyTitle}>Henüz bomboş bir evren</p>
              <p className={styles.emptySub}>Fikirler yakında burada parlamaya başlayacak.</p>
            </>
          )}
        </div>
      )}

      {!selectedNode && (
        <div className={styles.help} aria-hidden>
          {editing
            ? "Boşluğa tıkla: ana modül · + tutamağını sürükle: alt modül / bağıntı · Del: sil · Ctrl+S: kaydet"
            : "Sürükle: gezin · Tekerlek: yakınlaş · / : ara"}
        </div>
      )}

      {selectedNode && (
        <NodePanel
          key={selectedNode.id}
          node={selectedNode}
          index={index}
          editing={editing}
          saveStatus={panelSaveStatus}
          width={panelWidth}
          onClose={() => selectNode(null, false)}
          onChange={(patch) => patchNode(selectedNode.id, patch)}
          onDelete={() => deleteNode(selectedNode.id)}
          onFlyTo={(id) => selectNode(id)}
        />
      )}

      {create && (
        <CreatePopover
          key={`${create.mode}-${create.wx}-${create.wy}`}
          apiRef={apiRef}
          wx={create.wx}
          wy={create.wy}
          mode={create.mode}
          parentTitle={create.mode === "sub" ? index.byId.get(create.parentId)?.title : undefined}
          onSubmit={(title) => createNode(create, title)}
          onCancel={() => setCreate(null)}
        />
      )}

      {edgeForPop && edgePop && (
        <EdgePopover
          key={edgeForPop.id}
          apiRef={apiRef}
          edge={edgeForPop}
          wx={edgePop.wx}
          wy={edgePop.wy}
          onSave={(label) => updateEdgeLabel(edgeForPop.id, label)}
          onDelete={() => deleteEdge(edgeForPop.id, false)}
          onClose={() => setEdgePop(null)}
        />
      )}

      {searchOpen && (
        <Search
          nodes={graph.nodes}
          colors={index.color}
          onClose={() => setSearchOpen(false)}
          onPick={(id) => {
            setSearchOpen(false);
            selectNode(id);
          }}
        />
      )}

      <div className={styles.toasts} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${t.kind === "error" ? styles.toastError : ""}`}>
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}
