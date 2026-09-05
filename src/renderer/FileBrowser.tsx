import { useState, type ReactNode, type MouseEvent } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Folder,
  File,
  FileText,
  FileImage,
  FileCode2,
  FileArchive,
  Link,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type { RemoteEntry } from "../shared/types";
import { fileKind, formatSize } from "../shared/files";
export function FileIcon({
  entry,
  size = 19,
}: {
  entry: RemoteEntry;
  size?: number;
}): ReactNode {
  const props = { size, strokeWidth: 1.4 };
  if (entry.kind === "directory")
    return <Folder {...props} className="folder-icon" fill="currentColor" />;
  if (entry.kind === "symlink")
    return <Link {...props} className="link-icon" />;
  if (/\.(png|jpe?g|webp|gif|svg|heic)$/i.test(entry.name))
    return <FileImage {...props} className="image-icon" />;
  if (/\.(json|[jt]sx?|py|sh|css|html|toml|ya?ml|rs|go)$/i.test(entry.name))
    return <FileCode2 {...props} className="code-icon" />;
  if (/\.(zip|gz|tar|7z)$/i.test(entry.name))
    return <FileArchive {...props} className="archive-icon" />;
  if (/\.(txt|md|log|csv)$/i.test(entry.name))
    return <FileText {...props} className="document-icon" />;
  return <File {...props} className="document-icon" />;
}
const columns: ColumnDef<RemoteEntry>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: (info) => (
      <span className="file-name">
        <FileIcon entry={info.row.original} />
        <span>{info.row.original.name}</span>
      </span>
    ),
    sortingFn: (a, b) =>
      Number(b.original.kind === "directory") -
        Number(a.original.kind === "directory") ||
      a.original.name.localeCompare(b.original.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
  },
  {
    accessorKey: "modified",
    header: "Date modified",
    cell: (info) =>
      new Date(info.row.original.modified).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: (info) =>
      info.row.original.kind === "directory"
        ? "—"
        : formatSize(info.row.original.size),
  },
  { id: "kind", accessorFn: fileKind, header: "Kind" },
];
export function FileBrowser({
  entries,
  view,
  selected,
  onSelect,
  onOpen,
  onContext,
  onKeyDown,
}: {
  entries: RemoteEntry[];
  view: "list" | "icons";
  selected: string[];
  onSelect: (paths: string[]) => void;
  onOpen: (entry: RemoteEntry) => void;
  onContext: (event: MouseEvent, entry: RemoteEntry) => void;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
}): ReactNode {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const table = useReactTable({
    data: entries,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const rows = table.getRowModel().rows;
  function select(event: MouseEvent, entry: RemoteEntry): void {
    if (event.shiftKey && anchor) {
      const from = rows.findIndex((row) => row.original.path === anchor),
        to = rows.findIndex((row) => row.original.path === entry.path);
      if (from >= 0 && to >= 0) {
        onSelect(
          rows
            .slice(Math.min(from, to), Math.max(from, to) + 1)
            .map((r) => r.original.path),
        );
        return;
      }
    }
    setAnchor(entry.path);
    onSelect(
      event.metaKey || event.ctrlKey
        ? selected.includes(entry.path)
          ? selected.filter((p) => p !== entry.path)
          : [...selected, entry.path]
        : [entry.path],
    );
  }
  return (
    <div
      className="file-browser"
      tabIndex={0}
      aria-label="Remote files"
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const index = rows.findIndex(
            (r) => r.original.path === selected[selected.length - 1],
          );
          const row =
            rows[
              Math.max(
                0,
                Math.min(
                  rows.length - 1,
                  index + (event.key === "ArrowDown" ? 1 : -1),
                ),
              )
            ];
          if (row)
            onSelect(
              event.shiftKey
                ? [...new Set([...selected, row.original.path])]
                : [row.original.path],
            );
        } else onKeyDown(event);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onSelect([]);
      }}
    >
      {view === "list" ? (
        <table aria-label="Files">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : "none"
                    }
                  >
                    <button onClick={header.column.getToggleSortingHandler()}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {header.column.getIsSorted() === "asc" ? (
                        <ChevronUp size={11} />
                      ) : header.column.getIsSorted() === "desc" ? (
                        <ChevronDown size={11} />
                      ) : null}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.original.path}
                aria-selected={selected.includes(row.original.path)}
                className={
                  selected.includes(row.original.path) ? "selected" : ""
                }
                onClick={(e) => select(e, row.original)}
                onDoubleClick={() => onOpen(row.original)}
                onContextMenu={(e) => onContext(e, row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div
          className="icon-grid"
          role="listbox"
          aria-label="Files"
          aria-multiselectable
        >
          {rows.map((row) => (
            <button
              role="option"
              aria-selected={selected.includes(row.original.path)}
              className={`file-tile ${selected.includes(row.original.path) ? "selected" : ""}`}
              key={row.original.path}
              onClick={(e) => select(e, row.original)}
              onDoubleClick={() => onOpen(row.original)}
              onContextMenu={(e) => onContext(e, row.original)}
            >
              <FileIcon entry={row.original} size={58} />
              <span>{row.original.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
