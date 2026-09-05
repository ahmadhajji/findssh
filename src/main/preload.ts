import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { API, AppEvent } from "../shared/types";
const api: API = {
  setDirty: (dirty) => ipcRenderer.invoke("setDirty", dirty),
  editText: (command) => ipcRenderer.invoke("editText", command),
  bootstrap: () => ipcRenderer.invoke("bootstrap"),
  connect: (input) => ipcRenderer.invoke("connect", input),
  disconnect: () => ipcRenderer.invoke("disconnect"),
  list: (path) => ipcRenderer.invoke("list", path),
  mkdir: (path, name) => ipcRenderer.invoke("mkdir", path, name),
  rename: (path, name) => ipcRenderer.invoke("rename", path, name),
  remove: (paths) => ipcRenderer.invoke("remove", paths),
  upload: (path, folders) => ipcRenderer.invoke("upload", path, folders),
  dropUpload: (path, files) =>
    ipcRenderer.invoke(
      "dropUpload",
      path,
      files.map((file) => webUtils.getPathForFile(file)),
    ),
  download: (paths) => ipcRenderer.invoke("download", paths),
  copy: (paths, destination, move) =>
    ipcRenderer.invoke("copy", paths, destination, move),
  read: (path) => ipcRenderer.invoke("read", path),
  write: (doc) => ipcRenderer.invoke("write", doc),
  chooseKey: () => ipcRenderer.invoke("chooseKey"),
  respond: (id, answers) => ipcRenderer.invoke("respond", id, answers),
  onEvent: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      event: AppEvent,
    ): void => callback(event);
    ipcRenderer.on("app:event", listener);
    return () => ipcRenderer.removeListener("app:event", listener);
  },
};
contextBridge.exposeInMainWorld("findssh", api);
