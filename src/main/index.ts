import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  type IpcMainInvokeEvent,
} from "electron";
import { join, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { userInfo } from "node:os";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Session } from "./session";
import {
  connectionSchema,
  pathSchema,
  nameSchema,
  type AppEvent,
} from "../shared/types";

let window: BrowserWindow | null = null;
let session: Session;
let dirtyEditor = false;
let quitRequested = false;
app.on("before-quit", () => {
  quitRequested = true;
});
const prompts = new Map<string, (answers: string[] | null) => void>();
const documentPath = join(__dirname, "../renderer/index.html");
const documentURL = pathToFileURL(documentPath).href;
const localPathSchema = z
  .string()
  .min(1)
  .max(32768)
  .refine((p) => isAbsolute(p) && !p.includes("\0"));
const pathsSchema = z.array(pathSchema).min(1).max(10000);
function send(event: AppEvent): void {
  if (window && !window.isDestroyed())
    window.webContents.send("app:event", event);
}
function currentWindow(): BrowserWindow {
  if (!window) throw new Error("No active window");
  return window;
}
function authorize(event: IpcMainInvokeEvent): void {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    event.senderFrame.url !== documentURL
  )
    throw new Error("Untrusted request");
}
function handle<T extends z.ZodType>(
  name: string,
  schema: T,
  fn: (args: z.infer<T>) => unknown,
): void {
  ipcMain.handle(name, async (event, ...args: unknown[]) => {
    authorize(event);
    return fn(schema.parse(args));
  });
}
function wire(): void {
  handle("setDirty", z.tuple([z.boolean()]), ([dirty]) => {
    dirtyEditor = dirty;
    window?.setDocumentEdited(dirty);
  });
  handle(
    "editText",
    z.tuple([z.enum(["copy", "cut", "paste", "selectAll"])]),
    ([command]) => {
      currentWindow().webContents[command]();
    },
  );
  handle("bootstrap", z.tuple([]), async () => ({
    username: userInfo().username,
    recent: await session.load(),
  }));
  handle("connect", z.tuple([connectionSchema]), ([input]) =>
    session.connect(input),
  );
  handle("disconnect", z.tuple([]), () => {
    if (session.busy)
      throw new Error("Wait for the current operation to finish.");
    session.disconnect();
  });
  handle("list", z.tuple([pathSchema]), ([path]) => session.list(path));
  handle("mkdir", z.tuple([pathSchema, nameSchema]), ([path, name]) =>
    session.mkdir(path, name),
  );
  handle("rename", z.tuple([pathSchema, nameSchema]), ([path, name]) =>
    session.rename(path, name),
  );
  handle("remove", z.tuple([pathsSchema]), ([paths]) => session.remove(paths));
  handle(
    "upload",
    z.tuple([pathSchema, z.boolean()]),
    async ([path, folders]) => {
      const result = await dialog.showOpenDialog(currentWindow(), {
        title: folders ? "Upload folders" : "Upload files",
        buttonLabel: "Upload",
        properties: [folders ? "openDirectory" : "openFile", "multiSelections"],
      });
      if (!result.canceled) await session.upload(result.filePaths, path);
    },
  );
  handle(
    "dropUpload",
    z.tuple([pathSchema, z.array(localPathSchema).min(1).max(10000)]),
    ([path, files]) => session.upload(files, path),
  );
  handle("download", z.tuple([pathsSchema]), async ([paths]) => {
    const result = await dialog.showOpenDialog(currentWindow(), {
      title: "Download to folder",
      buttonLabel: "Download here",
      properties: ["openDirectory", "createDirectory"],
    });
    const directory = result.filePaths[0];
    if (!result.canceled && directory) await session.download(paths, directory);
  });
  handle(
    "copy",
    z.tuple([pathsSchema, pathSchema, z.boolean()]),
    ([paths, destination, move]) => session.copy(paths, destination, move),
  );
  handle("read", z.tuple([pathSchema]), ([path]) => session.read(path));
  handle(
    "write",
    z.tuple([
      z.object({
        path: pathSchema,
        content: z.string().max(2 * 1024 * 1024),
        revision: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    ]),
    ([doc]) => session.write(doc),
  );
  handle("chooseKey", z.tuple([]), async () => {
    const result = await dialog.showOpenDialog(currentWindow(), {
      title: "Choose a private SSH key",
      properties: ["openFile", "showHiddenFiles"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle(
    "respond",
    z.tuple([
      z.string().uuid(),
      z.array(z.string().max(4096)).max(50).nullable(),
    ]),
    ([id, answers]) => {
      prompts.get(id)?.(answers);
    },
  );
}
function makeWindow(): void {
  window = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 780,
    minHeight: 520,
    title: "FindSSH",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: "#f5f5f5",
    vibrancy: "sidebar",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  let closing = false;
  window.on("close", (event) => {
    if ((session.busy || dirtyEditor) && !closing) {
      event.preventDefault();
      void dialog
        .showMessageBox(currentWindow(), {
          type: "warning",
          message: "Close FindSSH?",
          detail:
            "Unsaved edits will be discarded and active operations will stop. Incomplete folder transfers may remain.",
          buttons: ["Keep open", "Close"],
          cancelId: 0,
          defaultId: 0,
        })
        .then((result) => {
          if (result.response === 1) {
            closing = true;
            if (quitRequested) app.quit();
            else window?.close();
          } else {
            quitRequested = false;
          }
        });
    }
  });
  window.on("closed", () => {
    session.disconnect();
    dirtyEditor = false;
    for (const resolve of prompts.values()) resolve(null);
    window = null;
  });
  void window.loadFile(documentPath);
}
void app.whenReady().then(() => {
  session = new Session(app.getPath("userData"), {
    ask: (title, message, fields) =>
      new Promise((resolve) => {
        const id = randomUUID();
        const timeout = setTimeout(() => finish(null), 170000);
        const finish = (answers: string[] | null): void => {
          clearTimeout(timeout);
          prompts.delete(id);
          resolve(answers);
        };
        prompts.set(id, finish);
        send({ kind: "prompt", prompt: { id, title, message, fields } });
      }),
    confirm: async (title, message) =>
      (
        await dialog.showMessageBox(currentWindow(), {
          type: "warning",
          message: title,
          detail: message,
          buttons: [
            "Cancel",
            title.startsWith("Trust") ? "Trust and connect" : "Delete",
          ],
          defaultId: 0,
          cancelId: 0,
        })
      ).response === 1,
    progress: (transfer) => send({ kind: "transfer", transfer }),
    disconnected: (message) => send({ kind: "disconnected", message }),
  });
  wire();
  makeWindow();
  const command =
    (name: string): (() => void) =>
    () =>
      send({ kind: "command", command: name });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin"
        ? [
            {
              label: "FindSSH",
              submenu: [
                { role: "about" as const },
                { type: "separator" as const },
                { role: "hide" as const },
                { role: "hideOthers" as const },
                { role: "unhide" as const },
                { type: "separator" as const },
                { role: "quit" as const },
              ],
            },
          ]
        : []),
      {
        label: "File",
        submenu: [
          {
            label: "Connect to server…",
            accelerator: "CmdOrCtrl+K",
            click: command("connect"),
          },
          {
            label: "New folder…",
            accelerator: "CmdOrCtrl+Shift+N",
            click: command("mkdir"),
          },
          {
            label: "Upload files…",
            accelerator: "CmdOrCtrl+U",
            click: command("upload"),
          },
          {
            label: "Download selection…",
            accelerator: "CmdOrCtrl+Shift+D",
            click: command("download"),
          },
          { label: "Rename…", click: command("rename") },
          {
            label: "Delete…",
            accelerator: "CmdOrCtrl+Backspace",
            click: command("delete"),
          },
          { type: "separator" },
          { role: "close" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          {
            label: "Cut",
            accelerator: "CmdOrCtrl+X",
            click: command("native-cut"),
            id: "native-cut",
          },
          {
            label: "Copy",
            accelerator: "CmdOrCtrl+C",
            click: command("native-copy"),
            id: "native-copy",
          },
          {
            label: "Paste",
            accelerator: "CmdOrCtrl+V",
            click: command("native-paste"),
            id: "native-paste",
          },
          {
            label: "Select all",
            accelerator: "CmdOrCtrl+A",
            click: command("native-selectAll"),
            id: "native-selectAll",
          },
        ],
      },
      {
        label: "View",
        submenu: [
          {
            label: "as Icons",
            accelerator: "CmdOrCtrl+1",
            click: command("icons"),
          },
          {
            label: "as List",
            accelerator: "CmdOrCtrl+2",
            click: command("list"),
          },
          {
            label: "Show hidden files",
            accelerator: "CmdOrCtrl+Shift+.",
            click: command("hidden"),
          },
          {
            label: "Refresh",
            accelerator: "CmdOrCtrl+R",
            click: command("refresh"),
          },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      {
        label: "Go",
        submenu: [
          { label: "Back", accelerator: "CmdOrCtrl+[", click: command("back") },
          {
            label: "Forward",
            accelerator: "CmdOrCtrl+]",
            click: command("forward"),
          },
          {
            label: "Enclosing folder",
            accelerator: "CmdOrCtrl+Up",
            click: command("parent"),
          },
          {
            label: "Home",
            accelerator: "CmdOrCtrl+Shift+H",
            click: command("home"),
          },
          {
            label: "Go to folder…",
            accelerator: "CmdOrCtrl+Shift+G",
            click: command("goto"),
          },
        ],
      },
      {
        label: "Window",
        submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "front" }],
      },
    ]),
  );
  app.on("activate", () => {
    if (!window) makeWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
