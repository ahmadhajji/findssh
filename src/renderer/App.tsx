import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  House,
  HardDrive,
  Server,
  Folder,
  FolderPlus,
  Upload,
  Download,
  Search,
  List,
  Grid2X2,
  RefreshCw,
  LockKeyhole,
  Ellipsis,
  X,
  LogOut,
  ArrowUp,
  Info,
  Eye,
  Copy,
  Scissors,
  ClipboardPaste,
  Pencil,
  Trash2,
} from "lucide-react";
import type {
  Bootstrap,
  Connection,
  ConnectionInput,
  Directory,
  Prompt,
  RemoteEntry,
  TextDocument,
  Transfer,
} from "../shared/types";
import { formatSize, parentPath, visibleEntries } from "../shared/files";
import { Modal, InputDialog } from "./Dialogs";
import { ConnectionForm } from "./ConnectionForm";
import { FileBrowser, FileIcon } from "./FileBrowser";
const api = window.findssh;
type Dialog =
  | { kind: "connect" }
  | { kind: "mkdir" }
  | { kind: "rename"; entry: RemoteEntry }
  | { kind: "goto" }
  | { kind: "info"; entry: RemoteEntry }
  | { kind: "edit"; document: TextDocument };
export function App(): ReactNode {
  const [bootstrap, setBootstrap] = useState<Bootstrap>({
    username: "",
    recent: [],
  });
  const [connection, setConnection] = useState<Connection | null>(null);
  const [directory, setDirectory] = useState<Directory>({
    path: "/",
    entries: [],
  });
  const [history, setHistory] = useState<string[]>([]),
    [cursor, setCursor] = useState(-1);
  const [view, setView] = useState<"list" | "icons">(
    localStorage.getItem("view") === "icons" ? "icons" : "list",
  );
  const [selected, setSelected] = useState<string[]>([]),
    [query, setQuery] = useState("");
  const [hidden, setHidden] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null),
    [prompt, setPrompt] = useState<Prompt | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [context, setContext] = useState<{ x: number; y: number } | null>(null);
  const [clipboard, setClipboard] = useState<{
    paths: string[];
    move: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const loading = useRef(false);
  const commandRef = useRef<(command: string) => void>(() => undefined);
  useEffect(() => {
    void api
      .bootstrap()
      .then(setBootstrap)
      .catch((e) => setError(String(e)));
    return api.onEvent((event) => {
      if (event.kind === "prompt") setPrompt(event.prompt);
      if (event.kind === "transfer") setTransfer(event.transfer);
      if (event.kind === "disconnected") {
        setConnection(null);
        setClipboard(null);
        setDialog((current) => (current?.kind === "edit" ? current : null));
        setPrompt(null);
        setError(event.message);
      }
      if (event.kind === "command") commandRef.current(event.command);
    });
  }, []);
  useEffect(() => {
    localStorage.setItem("view", view);
  }, [view]);
  function report(e: unknown): void {
    setError(
      (e instanceof Error ? e.message : String(e)).replace(
        /^Error invoking remote method '[^']+': Error: /,
        "",
      ),
    );
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      report(e);
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }
  async function load(path: string, target?: number): Promise<void> {
    const result = await api.list(path);
    setDirectory(result);
    setSelected([]);
    setQuery("");
    if (target !== undefined) setCursor(target);
    else {
      const next = [...history.slice(0, cursor + 1), result.path];
      setHistory(next);
      setCursor(next.length - 1);
    }
  }
  const navigate = (path: string, target?: number): void => {
    void run(() => load(path, target));
  };
  const refresh = async (): Promise<void> => {
    const result = await api.list(directory.path);
    setDirectory(result);
    setSelected((paths) =>
      paths.filter((p) => result.entries.some((e) => e.path === p)),
    );
  };
  const mutate = (work: () => Promise<unknown>): void => {
    setContext(null);
    void run(async () => {
      try {
        await work();
      } finally {
        await refresh();
      }
    });
  };
  function connect(input: ConnectionInput): void {
    void run(async () => {
      setConnection(null);
      setDirectory({ path: "/", entries: [] });
      setSelected([]);
      setClipboard(null);
      setHistory([]);
      setCursor(-1);
      const result = await api.connect(input);
      setDirectory({ path: result.home, entries: [] });
      setConnection(result);
      setClipboard(null);
      setDialog(null);
      const listing = await api.list(result.home);
      setDirectory(listing);
      setHistory([listing.path]);
      setCursor(0);
      setSelected([]);
      setQuery("");
    });
  }
  function open(entry: RemoteEntry): void {
    if (entry.kind === "directory" || entry.kind === "symlink") {
      navigate(entry.path);
      return;
    }
    void run(async () =>
      setDialog({ kind: "edit", document: await api.read(entry.path) }),
    );
  }
  const entries = visibleEntries(directory.entries, query, hidden);
  const chosen = directory.entries.filter((e) => selected.includes(e.path));
  function command(name: string): void {
    if (name.startsWith("native-")) {
      const action = name.slice(7);
      if (
        action === "copy" ||
        action === "cut" ||
        action === "paste" ||
        action === "selectAll"
      ) {
        if (
          document.activeElement?.matches(
            "input, textarea, [contenteditable=true]",
          )
        ) {
          void api.editText(action).catch(report);
          return;
        }
        if (action === "selectAll") {
          if (!dialog && !prompt && !busy)
            setSelected(entries.map((e) => e.path));
          return;
        }
        command(action);
        return;
      }
    }
    setContext(null);
    if (dialog || prompt || busy) return;
    if (name === "connect") {
      setDialog({ kind: "connect" });
      return;
    }
    if (!connection) return;
    if (name === "icons" || name === "list") setView(name);
    if (name === "hidden") {
      setHidden(!hidden);
      setSelected([]);
    }
    if (name === "refresh") void run(refresh);
    if (name === "home") navigate(connection.home);
    if (name === "parent") navigate(parentPath(directory.path));
    if (name === "back" && cursor > 0)
      navigate(history[cursor - 1] || "/", cursor - 1);
    if (name === "forward" && cursor < history.length - 1)
      navigate(history[cursor + 1] || "/", cursor + 1);
    if (name === "goto") setDialog({ kind: "goto" });
    if (name === "mkdir") setDialog({ kind: "mkdir" });
    if (name === "upload") mutate(() => api.upload(directory.path, false));
    if (name === "upload-folder")
      mutate(() => api.upload(directory.path, true));
    if (name === "download" && selected.length)
      void run(() => api.download(selected));
    if (name === "delete" && selected.length)
      mutate(() => api.remove(selected));
    if (name === "rename" && chosen.length === 1 && chosen[0])
      setDialog({ kind: "rename", entry: chosen[0] });
    if (name === "open" && chosen.length === 1 && chosen[0]) open(chosen[0]);
    if (name === "info" && chosen.length === 1 && chosen[0])
      setDialog({ kind: "info", entry: chosen[0] });
    if ((name === "copy" || name === "cut") && selected.length)
      setClipboard({ paths: selected, move: name === "cut" });
    if (name === "paste" && clipboard)
      mutate(async () => {
        await api.copy(clipboard.paths, directory.path, clipboard.move);
        if (clipboard.move) setClipboard(null);
      });
  }
  commandRef.current = command;
  function showContext(event: MouseEvent, entry?: RemoteEntry): void {
    event.preventDefault();
    if (busy) return;
    if (entry && !selected.includes(entry.path)) setSelected([entry.path]);
    setContext({
      x: Math.min(event.clientX, window.innerWidth - 235),
      y: Math.min(event.clientY, window.innerHeight - 410),
    });
  }
  const toolbarButton = (
    label: string,
    icon: ReactNode,
    action: () => void,
    disabled = false,
    active = false,
  ): ReactNode => (
    <button
      title={label}
      aria-label={label}
      className={`tool ${active ? "active" : ""}`}
      onClick={action}
      disabled={busy || disabled}
    >
      {icon}
    </button>
  );
  const name =
    directory.path.split("/").filter(Boolean).pop() ||
    connection?.host ||
    "FindSSH";
  return (
    <div className="app" onClick={() => context && setContext(null)}>
      <aside className="sidebar">
        <div className="sidebar-top" />
        <div className="sidebar-content">
          <h3>Favorites</h3>
          <button
            disabled={!connection || busy}
            className={
              connection && directory.path === connection.home ? "current" : ""
            }
            onClick={() => connection && navigate(connection.home)}
          >
            <House />
            Home
          </button>
          <button
            disabled={!connection || busy}
            className={connection && directory.path === "/" ? "current" : ""}
            onClick={() => navigate("/")}
          >
            <HardDrive />
            Filesystem
          </button>
          <h3>Locations</h3>
          {connection ? (
            <button
              className="server-location"
              onClick={() => navigate(connection.home)}
              disabled={busy}
            >
              <Server />
              <span>{connection.host}</span>
              <span className="online-dot" />
            </button>
          ) : (
            <p className="sidebar-hint">
              Your connected server
              <br />
              will appear here.
            </p>
          )}
          <button
            aria-label="Connect to server"
            onClick={() => setDialog({ kind: "connect" })}
            disabled={busy}
          >
            <span className="plus">+</span>Connect to server
          </button>
        </div>
        <div className="sidebar-bottom">
          <LockKeyhole size={13} />
          {connection ? "SFTP · Encrypted connection" : "Private by connection"}
        </div>
      </aside>
      <main>
        <header className="toolbar">
          <div className="navigation">
            {toolbarButton(
              "Back",
              <ChevronLeft />,
              () => command("back"),
              cursor <= 0 || !connection,
            )}
            {toolbarButton(
              "Forward",
              <ChevronRight />,
              () => command("forward"),
              cursor >= history.length - 1 || !connection,
            )}
          </div>
          <div className="window-title">
            <strong>{connection ? name : "FindSSH"}</strong>
            <span>
              {connection
                ? `${connection.username}@${connection.host}`
                : "Connect to your files"}
            </span>
          </div>
          {connection && (
            <>
              <div className="view-switch">
                {toolbarButton(
                  "Icon view",
                  <Grid2X2 size={17} />,
                  () => setView("icons"),
                  false,
                  view === "icons",
                )}
                {toolbarButton(
                  "List view",
                  <List size={19} />,
                  () => setView("list"),
                  false,
                  view === "list",
                )}
              </div>
              <div className="toolbar-divider" />
              {toolbarButton("New folder", <FolderPlus />, () =>
                command("mkdir"),
              )}
              {toolbarButton("Upload files", <Upload />, () =>
                command("upload"),
              )}
              {toolbarButton(
                "Download selection",
                <Download />,
                () => command("download"),
                !selected.length,
              )}
              {toolbarButton("More actions", <Ellipsis />, eMore)}
              <label className="search">
                <Search size={15} />
                <input
                  aria-label="Search this folder"
                  placeholder="Search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelected([]);
                  }}
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X size={12} />
                  </button>
                )}
              </label>
            </>
          )}
        </header>
        {error && (
          <div className="error" role="alert">
            <Info size={17} />
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {!connection ? (
          <div className="welcome">
            {bootstrap.username && (
              <ConnectionForm
                key={bootstrap.username}
                {...bootstrap}
                busy={busy}
                onConnect={connect}
              />
            )}
          </div>
        ) : (
          <>
            <div
              className={`browser-container ${dragging ? "dragging" : ""}`}
              aria-busy={busy}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                  e.preventDefault();
                  setDragging(true);
                }
              }}
              onDragLeave={(e) => {
                if (
                  !e.currentTarget.contains(
                    e.relatedTarget instanceof Node ? e.relatedTarget : null,
                  )
                )
                  setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files.length)
                  mutate(() =>
                    api.dropUpload(
                      directory.path,
                      Array.from(e.dataTransfer.files),
                    ),
                  );
              }}
            >
              <FileBrowser
                entries={entries}
                view={view}
                selected={selected}
                onSelect={setSelected}
                onOpen={open}
                onContext={showContext}
                onKeyDown={(e) => {
                  const modifier = e.metaKey || e.ctrlKey;
                  if (modifier && e.key.toLowerCase() === "a") {
                    e.preventDefault();
                    setSelected(entries.map((e) => e.path));
                  }
                  if (
                    modifier &&
                    ["c", "x", "v"].includes(e.key.toLowerCase())
                  ) {
                    e.preventDefault();
                    command(
                      e.key.toLowerCase() === "c"
                        ? "copy"
                        : e.key.toLowerCase() === "x"
                          ? "cut"
                          : "paste",
                    );
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    command("rename");
                  }
                  if (e.key === " " && selected.length === 1) {
                    e.preventDefault();
                    command("open");
                  }
                }}
              />
              {!entries.length && (
                <div className="empty-folder">
                  <Folder size={54} strokeWidth={1} />
                  <h2>
                    {query ? "No matching files" : "This folder is empty"}
                  </h2>
                  <p>
                    {query
                      ? "Try a different name in this folder."
                      : "Drop files here or use Upload to add them."}
                  </p>
                </div>
              )}
              {dragging && (
                <div className="drop-overlay">
                  <Upload size={38} />
                  <strong>Upload to {name}</strong>
                </div>
              )}
            </div>
            <div className="path-bar">
              <HardDrive size={13} />
              <button onClick={() => navigate("/")}>{connection.host}</button>
              {directory.path
                .split("/")
                .filter(Boolean)
                .map((part, index, parts) => (
                  <span key={parts.slice(0, index + 1).join("/")}>
                    <ChevronRight size={12} />
                    <button
                      onClick={() =>
                        navigate(`/${parts.slice(0, index + 1).join("/")}`)
                      }
                    >
                      {part}
                    </button>
                  </span>
                ))}
              <button
                className="path-go"
                title="Go to folder"
                aria-label="Go to folder"
                onClick={() => command("goto")}
              >
                <ChevronsUpDown size={13} />
              </button>
            </div>
            <footer className="status-bar">
              <span>
                {busy
                  ? transfer
                    ? `${transfer.direction === "upload" ? "Uploading" : transfer.direction === "download" ? "Downloading" : "Copying"} ${transfer.name}`
                    : "Working…"
                  : `${selected.length ? `${selected.length} of ` : ""}${entries.length} items`}
                {hidden ? " · Hidden files shown" : ""}
              </span>
              {transfer ? (
                <span className="transfer-progress">
                  <progress
                    max={Math.max(1, transfer.total)}
                    value={transfer.completed}
                  />
                  {formatSize(transfer.completed)} /{" "}
                  {formatSize(transfer.total)}
                </span>
              ) : (
                <span className="status-actions">
                  {clipboard && (
                    <span>
                      {clipboard.paths.length} item(s) ready to{" "}
                      {clipboard.move ? "move" : "copy"}
                    </span>
                  )}
                  <button
                    title="Refresh"
                    aria-label="Refresh"
                    disabled={busy}
                    onClick={() => command("refresh")}
                  >
                    <RefreshCw size={13} />
                  </button>
                  <button
                    title="Disconnect"
                    aria-label="Disconnect"
                    disabled={busy}
                    onClick={() => {
                      void run(async () => {
                        await api.disconnect();
                        setConnection(null);
                        setClipboard(null);
                        setSelected([]);
                        setBootstrap(await api.bootstrap());
                      });
                    }}
                  >
                    <LogOut size={13} />
                  </button>
                </span>
              )}
            </footer>
          </>
        )}
      </main>
      {context && (
        <div
          className="context-menu"
          role="menu"
          style={{ left: context.x, top: Math.max(62, context.y) }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setContext(null);
          }}
        >
          {menuItem("Open", "open", <Eye />, chosen.length !== 1)}
          {menuItem("Get info", "info", <Info />, chosen.length !== 1)}
          {menuItem("Download…", "download", <Download />, !selected.length)}
          <hr />
          {menuItem("Rename…", "rename", <Pencil />, chosen.length !== 1)}
          {menuItem("Copy", "copy", <Copy />, !selected.length)}
          {menuItem("Cut", "cut", <Scissors />, !selected.length)}
          {menuItem("Paste here", "paste", <ClipboardPaste />, !clipboard)}
          <hr />
          {menuItem("New folder…", "mkdir", <FolderPlus />)}
          {menuItem("Upload files…", "upload", <Upload />)}
          {menuItem("Upload folders…", "upload-folder", <Upload />)}
          {menuItem(
            hidden ? "Hide hidden files" : "Show hidden files",
            "hidden",
            <Eye />,
          )}
          {menuItem("Go to folder…", "goto", <ArrowUp />)}
          <hr />
          {menuItem(
            "Delete permanently…",
            "delete",
            <Trash2 />,
            !selected.length,
          )}
        </div>
      )}
      {dialog?.kind === "connect" && (
        <Modal
          title="Connect to server"
          onClose={() => !busy && setDialog(null)}
        >
          <ConnectionForm
            {...bootstrap}
            busy={busy}
            onConnect={connect}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}
      {dialog?.kind === "mkdir" && (
        <InputDialog
          title="New folder"
          label="Folder name"
          initial="untitled folder"
          onClose={() => setDialog(null)}
          onSubmit={(value) => {
            setDialog(null);
            mutate(() => api.mkdir(directory.path, value));
          }}
        />
      )}
      {dialog?.kind === "rename" && (
        <InputDialog
          title="Rename"
          label="Name"
          initial={dialog.entry.name}
          onClose={() => setDialog(null)}
          onSubmit={(value) => {
            const path = dialog.entry.path;
            setDialog(null);
            mutate(() => api.rename(path, value));
          }}
        />
      )}
      {dialog?.kind === "goto" && (
        <InputDialog
          title="Go to folder"
          label="Remote path"
          initial={directory.path}
          onClose={() => setDialog(null)}
          onSubmit={(value) => {
            setDialog(null);
            navigate(
              value === "~"
                ? connection?.home || "/"
                : value.startsWith("~/")
                  ? `${connection?.home}/${value.slice(2)}`
                  : value,
            );
          }}
        />
      )}
      {dialog?.kind === "info" && (
        <Modal
          title={`${dialog.entry.name} info`}
          onClose={() => setDialog(null)}
        >
          <div className="info-icon">
            <FileIcon entry={dialog.entry} size={56} />
          </div>
          <dl>
            <dt>Location</dt>
            <dd className="selectable">{dialog.entry.path}</dd>
            <dt>Kind</dt>
            <dd>{dialog.entry.kind}</dd>
            <dt>Size</dt>
            <dd>{formatSize(dialog.entry.size)}</dd>
            <dt>Modified</dt>
            <dd>{new Date(dialog.entry.modified).toLocaleString()}</dd>
            <dt>Permissions</dt>
            <dd>{(dialog.entry.mode & 0o777).toString(8)}</dd>
          </dl>
          <footer>
            <button onClick={() => setDialog(null)}>Done</button>
          </footer>
        </Modal>
      )}
      {dialog?.kind === "edit" && (
        <Editor
          connected={connection !== null}
          document={dialog.document}
          onClose={() => setDialog(null)}
          onSaved={() => {
            void run(refresh);
          }}
        />
      )}
      {prompt && (
        <AuthPrompt
          key={prompt.id}
          prompt={prompt}
          onAnswer={(answers) => {
            const id = prompt.id;
            setPrompt(null);
            void api.respond(id, answers).catch(report);
          }}
        />
      )}
    </div>
  );
  function eMore(): void {
    setContext(context ? null : { x: window.innerWidth - 250, y: 62 });
  }
  function menuItem(
    label: string,
    action: string,
    icon: ReactNode,
    disabled = false,
  ): ReactNode {
    return (
      <button
        role="menuitem"
        disabled={disabled}
        onClick={() => command(action)}
      >
        {icon}
        {label}
      </button>
    );
  }
}
function AuthPrompt({
  prompt,
  onAnswer,
}: {
  prompt: Prompt;
  onAnswer: (answers: string[] | null) => void;
}): ReactNode {
  const [answers, setAnswers] = useState<string[]>(prompt.fields.map(() => ""));
  return (
    <Modal title={prompt.title} onClose={() => onAnswer(null)}>
      <p className="prompt-message">{prompt.message}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAnswer(answers);
        }}
      >
        {prompt.fields.map((field, i) => (
          <label key={i}>
            {field.label}
            <input
              autoFocus={i === 0}
              type={field.secret ? "password" : "text"}
              value={answers[i] || ""}
              onChange={(e) =>
                setAnswers(
                  answers.map((a, j) => (i === j ? e.target.value : a)),
                )
              }
            />
          </label>
        ))}
        <footer>
          <button type="button" onClick={() => onAnswer(null)}>
            Cancel
          </button>
          <button className="primary">Continue</button>
        </footer>
      </form>
    </Modal>
  );
}
function Editor({
  connected,
  document,
  onClose,
  onSaved,
}: {
  connected: boolean;
  document: TextDocument;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const [saved, setSaved] = useState(document),
    [content, setContent] = useState(document.content);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false);
  const dirty = content !== saved.content;
  useEffect(() => {
    void api.setDirty(dirty);
    return () => {
      void api.setDirty(false);
    };
  }, [dirty]);
  function close(): void {
    if (saving) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  function save(): void {
    if (saving || !dirty || !connected) return;
    setSaving(true);
    setError("");
    void api
      .write({ ...saved, content })
      .then((result) => {
        setSaved(result);
        onSaved();
      })
      .catch((e) => setError(String(e)))
      .finally(() => setSaving(false));
  }
  return (
    <Modal
      wide
      title={document.path.split("/").pop() || "Text editor"}
      onClose={close}
    >
      <p className="editor-path">{document.path}</p>
      {error && (
        <p role="alert" className="editor-error">
          {error}
        </p>
      )}
      {!connected && (
        <p className="editor-error">
          Connection lost. Your draft is preserved. Copy your edits before
          closing this editor and reconnecting.
        </p>
      )}
      <textarea
        className="editor"
        aria-label="File contents"
        spellCheck={false}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            save();
          }
        }}
      />
      <footer>
        <span className="muted">
          UTF-8 · {formatSize(new TextEncoder().encode(content).length)}
          {dirty ? " · Unsaved changes" : ""}
        </span>
        <button disabled={saving} onClick={close}>
          Close
        </button>
        <button
          className="primary"
          disabled={!dirty || saving || !connected}
          onClick={save}
        >
          {saving ? "Saving…" : "Save to server"}
        </button>
      </footer>
      {discard && (
        <Modal
          title="Discard unsaved changes?"
          onClose={() => setDiscard(false)}
        >
          <p>Your edits have not been saved to the server.</p>
          <footer>
            <button onClick={() => setDiscard(false)}>Keep editing</button>
            <button className="danger" onClick={onClose}>
              Discard changes
            </button>
          </footer>
        </Modal>
      )}
    </Modal>
  );
}
