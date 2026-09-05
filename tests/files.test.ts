import { expect, it } from "vitest";
import { formatSize, parentPath, visibleEntries } from "../src/shared/files";
import type { RemoteEntry } from "../src/shared/types";
it("keeps parent navigation at filesystem root", () => {
  expect(parentPath("/")).toBe("/");
  expect(parentPath("/home/user/")).toBe("/home");
});
it("filters hidden files and matches names without case sensitivity", () => {
  const base = { kind: "file", mode: 0, size: 0, modified: 0 } satisfies Omit<
    RemoteEntry,
    "name" | "path"
  >;
  const entries = [
    { ...base, name: ".env", path: "/.env" },
    { ...base, name: "README.md", path: "/README.md" },
  ];
  expect(visibleEntries(entries, "", false)).toHaveLength(1);
  expect(visibleEntries(entries, "readme", false)).toHaveLength(1);
  expect(visibleEntries(entries, "", true)).toHaveLength(2);
});
it("formats file sizes", () => {
  expect(formatSize(0)).toBe("0 B");
  expect(formatSize(1000)).toBe("1 KB");
  expect(formatSize(1000000)).toBe("1 MB");
});
