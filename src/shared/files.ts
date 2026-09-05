import type { RemoteEntry } from "./types";
export function parentPath(path: string): string {
  return path.replace(/\/+$/, "").split("/").slice(0, -1).join("/") || "/";
}
export function joinPath(parent: string, name: string): string {
  return `${parent.replace(/\/$/, "")}/${name}`;
}
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1000,
    index = 0;
  while (value >= 1000 && index < units.length - 1) {
    value /= 1000;
    index++;
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[index]}`;
}
export function fileKind(entry: RemoteEntry): string {
  if (entry.kind === "directory") return "Folder";
  if (entry.kind === "symlink") return "Symbolic link";
  const extension = entry.name.includes(".")
    ? entry.name.split(".").pop()?.toUpperCase()
    : undefined;
  return extension ? `${extension} document` : "Document";
}
export function visibleEntries(
  entries: RemoteEntry[],
  query: string,
  hidden: boolean,
): RemoteEntry[] {
  return entries.filter(
    (e) =>
      (hidden || !e.name.startsWith(".")) &&
      e.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
}
