import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Session,
  safeName,
  mutationPath,
  assertNotDescendant,
} from "../src/main/session";
import { startServer } from "./server";
import { connectionSchema } from "../src/shared/types";
let root: string,
  home: string,
  session: Session,
  server: Awaited<ReturnType<typeof startServer>>;
let promptTitles: string[];
let confirmations: string[], answers: string[] | null, allow: boolean;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "findssh-test-"));
  home = join(root, "remote");
  await mkdir(home);
  await writeFile(join(home, "hello.txt"), "Hello server\n");
  await writeFile(join(home, ".hidden"), "private");
  server = await startServer(home);
  confirmations = [];
  promptTitles = [];
  answers = ["test-password"];
  allow = true;
  session = new Session(join(root, "settings"), {
    ask: async (title) => {
      promptTitles.push(title);
      return answers;
    },
    confirm: async (title) => {
      confirmations.push(title);
      return allow;
    },
    progress: () => undefined,
    disconnected: () => undefined,
  });
  await session.load();
});
afterEach(async () => {
  session.disconnect();
  await server.close();
  await rm(root, { recursive: true, force: true });
});
async function connect(): Promise<void> {
  await session.connect({
    host: "127.0.0.1",
    port: server.port,
    username: "tester",
    password: "",
    privateKeyPath: "",
    passphrase: "",
  });
}
describe("SSH and SFTP integration", () => {
  it("prompts for authentication, trusts a host once, discovers home, and lists real files", async () => {
    await connect();
    const listing = await session.list(home);
    expect(listing.entries.map((e) => e.name)).toEqual(
      expect.arrayContaining(["hello.txt", ".hidden"]),
    );
    expect(listing.entries.find((e) => e.name === "hello.txt")?.kind).toBe(
      "file",
    );
    expect(confirmations).toEqual(["Trust this server?"]);
    session.disconnect();
    await connect();
    expect(confirmations).toHaveLength(1);
    expect(
      await readFile(join(root, "settings/connections.json"), "utf8"),
    ).not.toContain("test-password");
  });
  it("uploads and downloads nested folders, Unicode names, and binary contents without overwriting", async () => {
    await connect();
    const local = join(root, "local");
    await mkdir(local);
    await mkdir(join(local, "nested"));
    const data = Buffer.from([0, 255, 123, 42]);
    await writeFile(join(local, "nested/مرحبا.bin"), data);
    await session.upload([local], home);
    const destination = join(root, "download");
    await mkdir(destination);
    await session.download([join(home, "local")], destination);
    expect(await readFile(join(destination, "local/nested/مرحبا.bin"))).toEqual(
      data,
    );
    await expect(session.upload([local], home)).rejects.toThrow(
      "already exists",
    );
    await expect(
      session.download([join(home, "hello.txt")], destination),
    ).resolves.toBeUndefined();
    await expect(
      session.download([join(home, "hello.txt")], destination),
    ).rejects.toThrow();
    expect(await readdir(destination)).not.toEqual(
      expect.arrayContaining([expect.stringContaining(".partial")]),
    );
  });
  it("creates, renames, copies, moves and deletes while preserving link targets", async () => {
    await connect();
    await session.mkdir(home, "new");
    await session.rename(join(home, "new"), "renamed");
    await session.copy([join(home, "hello.txt")], join(home, "renamed"), false);
    await session.mkdir(home, "moved");
    await session.copy(
      [join(home, "renamed/hello.txt")],
      join(home, "moved"),
      true,
    );
    expect(await readFile(join(home, "moved/hello.txt"), "utf8")).toBe(
      "Hello server\n",
    );
    await symlink(join(home, "moved"), join(home, "renamed/link"));
    await session.remove([join(home, "renamed")]);
    expect(await readFile(join(home, "moved/hello.txt"), "utf8")).toBe(
      "Hello server\n",
    );
    allow = false;
    expect(await session.remove([join(home, "hello.txt")])).toBe(false);
    expect(await readFile(join(home, "hello.txt"), "utf8")).toBe(
      "Hello server\n",
    );
  });
  it("saves text atomically, detects conflicts and refuses binary edits", async () => {
    await connect();
    const document = await session.read(join(home, "hello.txt"));
    const saved = await session.write({ ...document, content: "Changed\n" });
    expect(await readFile(document.path, "utf8")).toBe("Changed\n");
    await writeFile(document.path, "Someone else changed it");
    await expect(
      session.write({ ...saved, content: "My edit" }),
    ).rejects.toThrow("changed on the server");
    expect(await readFile(document.path, "utf8")).toBe(
      "Someone else changed it",
    );
    await writeFile(join(home, "binary"), Buffer.from([0, 1, 2]));
    await expect(session.read(join(home, "binary"))).rejects.toThrow("binary");
    await writeFile(join(home, "large"), Buffer.alloc(2 * 1024 * 1024 + 1));
    await expect(session.read(join(home, "large"))).rejects.toThrow("2 MB");
  });
  it("rejects changed host fingerprints", async () => {
    await connect();
    session.disconnect();
    const port = server.port;
    await server.close();
    server = await startServer(home, { port });
    await expect(connect()).rejects.toThrow();
    expect(confirmations).toHaveLength(1);
  });
  it("rejects untrusted hosts and handles cancelled password prompts", async () => {
    allow = false;
    await expect(connect()).rejects.toThrow();
    allow = true;
    answers = null;
    await expect(connect()).rejects.toThrow();
  });
  it("supports keyboard-interactive authentication", async () => {
    await server.close();
    server = await startServer(home, { keyboard: true });
    answers = ["123456"];
    await connect();
    expect((await session.list(home)).entries).toHaveLength(2);
    expect(promptTitles).not.toContain("Password required");
  });
  it("rejects recursive copies through directory aliases", async () => {
    await connect();
    await session.mkdir(home, "folder");
    await symlink(join(home, "folder"), join(home, "alias"));
    await expect(
      session.copy([join(home, "folder")], join(home, "alias"), false),
    ).rejects.toThrow("outside");
  });
});
describe("path boundaries", () => {
  it.each(["..", ".", "../escape", "a/b", "nul\0byte"])(
    "rejects unsafe names: %s",
    (value) => {
      expect(() => safeName(value)).toThrow();
    },
  );
  it.each(["/", "//", "/a/..", "relative", "/bad\0"])(
    "protects root and malformed paths: %s",
    (path) => {
      expect(() => mutationPath(path)).toThrow();
    },
  );
  it("allows shell metacharacters as filenames without using a shell", () => {
    expect(safeName("$(touch pwned); *.txt")).toBe("$(touch pwned); *.txt");
  });
  it("rejects copying into the source", () => {
    expect(() => assertNotDescendant("/a", "/a/b")).toThrow();
    expect(() => assertNotDescendant("/a", "/ab")).not.toThrow();
  });
  it("validates connection ports and hosts", () => {
    expect(
      connectionSchema.safeParse({ host: "x", port: 0, username: "u" }).success,
    ).toBe(false);
  });
});
