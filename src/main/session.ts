import {
  Client,
  utils,
  type SFTPWrapper,
  type Stats,
  type FileEntry,
  type AnyAuthMethod,
} from "ssh2";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  readFile,
  writeFile,
  mkdir,
  lstat,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, posix } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { z } from "zod";
import {
  nameSchema,
  type ConnectionInput,
  type Connection,
  type Directory,
  type TextDocument,
  type Transfer,
  type SavedConnection,
} from "../shared/types";

export interface SessionUI {
  ask(
    title: string,
    message: string,
    fields: { label: string; secret: boolean }[],
  ): Promise<string[] | null>;
  confirm(title: string, message: string): Promise<boolean>;
  progress(transfer: Transfer | null): void;
  disconnected(message: string): void;
}
const persistedSchema = z.object({
  hosts: z.record(z.string(), z.string()),
  recent: z.array(
    z.object({
      host: z.string(),
      port: z.number(),
      username: z.string(),
      privateKeyPath: z.string(),
    }),
  ),
});
const MAX_TEXT = 2 * 1024 * 1024;
const revision = (data: Buffer): string =>
  createHash("sha256").update(data).digest("hex");
const missing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === 2;
export function safeName(name: string): string {
  return nameSchema.parse(name);
}
export function mutationPath(path: string): string {
  const normalized = posix.normalize(path);
  if (!path.startsWith("/") || path.includes("\0") || normalized === "/")
    throw new Error("The filesystem root cannot be changed.");
  return normalized;
}
export function destinationPath(parent: string, name: string): string {
  return posix.join(parent, safeName(name));
}
export function assertNotDescendant(source: string, destination: string): void {
  const from = posix.normalize(source),
    to = posix.normalize(destination);
  if (from === to || to.startsWith(`${from}/`))
    throw new Error("Choose a destination outside the source folder.");
}
export class Session {
  private client: Client | null = null;
  private sftp: SFTPWrapper | null = null;
  private connecting = false;
  private activeOperation = false;
  private closed = false;
  private state: z.infer<typeof persistedSchema> = { hosts: {}, recent: [] };
  constructor(
    private readonly dataDirectory: string,
    private readonly ui: SessionUI,
  ) {}
  async load(): Promise<SavedConnection[]> {
    try {
      this.state = persistedSchema.parse(
        JSON.parse(
          await readFile(join(this.dataDirectory, "connections.json"), "utf8"),
        ),
      );
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw new Error(
          "Saved connection data could not be read. Restore or remove connections.json before connecting.",
        );
    }
    return this.state.recent;
  }
  private async persist(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const temporary = join(
      this.dataDirectory,
      `connections-${randomUUID()}.tmp`,
    );
    await writeFile(temporary, JSON.stringify(this.state, null, 2), {
      mode: 0o600,
    });
    await rename(temporary, join(this.dataDirectory, "connections.json"));
  }
  async connect(input: ConnectionInput): Promise<Connection> {
    if (this.connecting)
      throw new Error("A connection is already in progress.");
    if (this.activeOperation)
      throw new Error("Wait for the current operation to finish.");
    this.disconnect();
    this.connecting = true;
    this.closed = false;
    const client = new Client();
    this.client = client;
    try {
      const keys: Buffer[] = [];
      const candidates = input.privateKeyPath
        ? [input.privateKeyPath]
        : [
            join(homedir(), ".ssh/id_ed25519"),
            join(homedir(), ".ssh/id_rsa"),
            join(homedir(), ".ssh/id_ecdsa"),
          ];
      for (const path of candidates) {
        try {
          keys.push(await readFile(path));
        } catch (error) {
          if (input.privateKeyPath) throw error;
        }
      }
      const methods: AnyAuthMethod[] = [
        { type: "none", username: input.username },
      ];
      if (process.env.SSH_AUTH_SOCK)
        methods.push({
          type: "agent",
          username: input.username,
          agent: process.env.SSH_AUTH_SOCK,
        });
      let keyIndex = 0,
        passwordTried = false,
        keyboardTried = false;
      client.on(
        "keyboard-interactive",
        (name, instructions, _language, prompts, finish) => {
          void this.ui
            .ask(
              name || "Server authentication",
              instructions || `Authenticate to ${input.host}`,
              prompts.map((p) => ({ label: p.prompt, secret: !p.echo })),
            )
            .then((answers) => {
              if (!answers) client.destroy();
              else finish(answers);
            })
            .catch(() => client.destroy());
        },
      );
      await new Promise<void>((resolve, reject) => {
        client.once("ready", resolve);
        client.on("error", reject);
        client.once("close", () =>
          reject(new Error("The SSH connection closed.")),
        );
        client.connect({
          host: input.host,
          port: input.port,
          username: input.username,
          tryKeyboard: true,
          readyTimeout: 180000,
          keepaliveInterval: 15000,
          keepaliveCountMax: 3,
          hostVerifier: (key: Buffer, verify: (valid: boolean) => void) => {
            const fingerprint = `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
            const host = `${input.host}:${input.port}`;
            const known = this.state.hosts[host];
            if (known) {
              verify(known === fingerprint);
              return;
            }
            void this.ui
              .confirm(
                "Trust this server?",
                `${host}\n\nServer fingerprint:\n${fingerprint}\n\nAccept only if this matches your server. FindSSH will remember this fingerprint.`,
              )
              .then(async (accepted) => {
                if (accepted) {
                  this.state.hosts[host] = fingerprint;
                  await this.persist();
                }
                verify(accepted);
              })
              .catch(() => verify(false));
          },
          authHandler: (methodsLeft, _partialSuccess, next) => {
            const authenticate = async (): Promise<void> => {
              const method = methods.shift();
              if (method) {
                if (
                  method.type === "agent" &&
                  methodsLeft &&
                  !methodsLeft.includes("publickey")
                ) {
                  await authenticate();
                  return;
                }
                next(method);
                return;
              }
              const key = keys[keyIndex++];
              if (key && (!methodsLeft || methodsLeft.includes("publickey"))) {
                let passphrase = input.passphrase;
                const parsed = utils.parseKey(key, passphrase || undefined);
                if (
                  parsed instanceof Error &&
                  /encrypted|passphrase/i.test(parsed.message)
                ) {
                  const answers = await this.ui.ask(
                    "Unlock SSH key",
                    "Enter the passphrase for your private key.",
                    [{ label: "Passphrase", secret: true }],
                  );
                  if (!answers) {
                    client.destroy();
                    return;
                  }
                  passphrase = answers[0] || "";
                }
                const unlocked = utils.parseKey(key, passphrase || undefined);
                if (unlocked instanceof Error) {
                  await authenticate();
                  return;
                }
                next({
                  type: "publickey",
                  username: input.username,
                  key,
                  passphrase: passphrase || undefined,
                });
                return;
              }
              if (
                !passwordTried &&
                (!methodsLeft || methodsLeft.includes("password"))
              ) {
                passwordTried = true;
                let password = input.password;
                if (!password) {
                  const answers = await this.ui.ask(
                    "Password required",
                    `Enter the password for ${input.username}@${input.host}.`,
                    [{ label: "Password", secret: true }],
                  );
                  if (!answers) {
                    client.destroy();
                    return;
                  }
                  password = answers[0] || "";
                }
                next({ type: "password", username: input.username, password });
                return;
              }
              if (
                !keyboardTried &&
                (!methodsLeft || methodsLeft.includes("keyboard-interactive"))
              ) {
                keyboardTried = true;
                next("keyboard-interactive");
                return;
              }
              client.destroy();
            };
            void authenticate().catch(() => client.destroy());
          },
        });
      });
      this.sftp = await new Promise<SFTPWrapper>((resolve, reject) =>
        client.sftp((error, sftp) => (error ? reject(error) : resolve(sftp))),
      );
      const home = await this.realpath(".");
      client.on("close", () => {
        if (this.client !== client) return;
        this.sftp = null;
        this.client = null;
        if (!this.closed)
          this.ui.disconnected(
            "The connection closed. Connect again to continue.",
          );
      });
      const saved = {
        host: input.host,
        port: input.port,
        username: input.username,
        privateKeyPath: input.privateKeyPath,
      };
      this.state.recent = [
        saved,
        ...this.state.recent.filter(
          (c) =>
            `${c.username}@${c.host}:${c.port}` !==
            `${saved.username}@${saved.host}:${saved.port}`,
        ),
      ].slice(0, 10);
      await this.persist();
      return {
        host: input.host,
        port: input.port,
        username: input.username,
        home,
      };
    } catch (error) {
      this.disconnect();
      throw error;
    } finally {
      this.connecting = false;
    }
  }
  disconnect(): void {
    this.closed = true;
    this.sftp = null;
    this.client?.destroy();
    this.client = null;
  }
  get busy(): boolean {
    return this.activeOperation || this.connecting;
  }
  private remote(): SFTPWrapper {
    if (!this.sftp) throw new Error("Connect to a server first.");
    return this.sftp;
  }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.activeOperation)
      throw new Error("Wait for the current file operation to finish.");
    this.activeOperation = true;
    try {
      return await work();
    } finally {
      this.activeOperation = false;
      this.ui.progress(null);
    }
  }
  private async realpath(path: string): Promise<string> {
    const s = this.remote();
    return new Promise((resolve, reject) =>
      s.realpath(path, (e, p) => (e ? reject(e) : resolve(p))),
    );
  }
  private async stat(path: string): Promise<Stats> {
    const s = this.remote();
    return new Promise((resolve, reject) =>
      s.lstat(path, (e, stat) => (e ? reject(e) : resolve(stat))),
    );
  }
  private async entries(path: string): Promise<FileEntry[]> {
    const s = this.remote();
    return new Promise((resolve, reject) =>
      s.readdir(path, (e, entries) =>
        e
          ? reject(e)
          : resolve(
              entries.filter((e) => e.filename !== "." && e.filename !== ".."),
            ),
      ),
    );
  }
  private async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);
      return true;
    } catch (e) {
      if (missing(e)) return false;
      throw e;
    }
  }
  private async requireNew(path: string): Promise<void> {
    if (await this.exists(path))
      throw new Error(
        `“${posix.basename(path)}” already exists. Rename it or choose another destination.`,
      );
  }
  private async makeDirectory(path: string): Promise<void> {
    const s = this.remote();
    return new Promise((resolve, reject) =>
      s.mkdir(path, (e) => (e ? reject(e) : resolve())),
    );
  }
  private async movePath(from: string, to: string): Promise<void> {
    const s = this.remote();
    return new Promise((resolve, reject) =>
      s.rename(from, to, (e) => (e ? reject(e) : resolve())),
    );
  }
  private async unlinkPath(path: string): Promise<void> {
    const s = this.remote();
    return new Promise((resolve, reject) =>
      s.unlink(path, (e) => (e ? reject(e) : resolve())),
    );
  }
  async list(path: string): Promise<Directory> {
    const canonical = await this.realpath(path);
    const entries = await this.entries(canonical);
    return {
      path: canonical,
      entries: entries.map((e) => ({
        name: safeName(e.filename),
        path: destinationPath(canonical, e.filename),
        size: e.attrs.size,
        modified: e.attrs.mtime * 1000,
        mode: e.attrs.mode,
        kind:
          (e.attrs.mode & 0o170000) === 0o040000
            ? "directory"
            : (e.attrs.mode & 0o170000) === 0o120000
              ? "symlink"
              : (e.attrs.mode & 0o170000) === 0o100000
                ? "file"
                : "other",
      })),
    };
  }
  async mkdir(parent: string, name: string): Promise<void> {
    await this.exclusive(() =>
      this.makeDirectory(destinationPath(parent, name)),
    );
  }
  async rename(path: string, name: string): Promise<void> {
    await this.exclusive(async () => {
      mutationPath(path);
      const target = destinationPath(posix.dirname(path), name);
      await this.requireNew(target);
      await this.movePath(path, target);
    });
  }
  async remove(paths: string[]): Promise<boolean> {
    return this.exclusive(async () => {
      paths.forEach(mutationPath);
      if (
        !(await this.ui.confirm(
          "Delete permanently?",
          `Delete ${paths.length} item(s) and their contents?\n\n${paths
            .map((p) => posix.basename(p))
            .slice(0, 8)
            .join(
              "\n",
            )}\n\nRemote files do not go to the Mac Trash. This cannot be undone.`,
        ))
      )
        return false;
      for (const path of paths) await this.removeTree(path);
      return true;
    });
  }
  private async removeTree(path: string): Promise<void> {
    mutationPath(path);
    const stat = await this.stat(path);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      for (const e of await this.entries(path))
        await this.removeTree(destinationPath(path, e.filename));
      const s = this.remote();
      await new Promise<void>((resolve, reject) =>
        s.rmdir(path, (e) => (e ? reject(e) : resolve())),
      );
    } else await this.unlinkPath(path);
  }
  private meter(
    name: string,
    direction: Transfer["direction"],
    total: number,
  ): Transform {
    let completed = 0,
      last = 0;
    return new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        completed += chunk.length;
        if (Date.now() - last > 100 || completed === total) {
          this.ui.progress({ name, direction, completed, total });
          last = Date.now();
        }
        callback(null, chunk);
      },
    });
  }
  async upload(localPaths: string[], remoteDirectory: string): Promise<void> {
    await this.exclusive(async () => {
      for (const local of localPaths)
        await this.uploadTree(
          local,
          destinationPath(remoteDirectory, basename(local)),
        );
    });
  }
  private async uploadTree(local: string, remote: string): Promise<void> {
    const info = await lstat(local);
    if (info.isSymbolicLink())
      throw new Error(
        `Symbolic link skipped: ${basename(local)}. Select the original file instead.`,
      );
    await this.requireNew(remote);
    if (info.isDirectory()) {
      await this.makeDirectory(remote);
      for (const name of await readdir(local))
        await this.uploadTree(join(local, name), destinationPath(remote, name));
    } else if (info.isFile()) {
      const temporary = `${remote}.findssh-${randomUUID()}.partial`;
      try {
        await pipeline(
          createReadStream(local),
          this.meter(basename(local), "upload", info.size),
          this.remote().createWriteStream(temporary, {
            flags: "wx",
            mode: info.mode & 0o777,
          }),
        );
        await this.requireNew(remote);
        await this.movePath(temporary, remote);
      } catch (e) {
        await this.unlinkPath(temporary).catch(() => undefined);
        throw e;
      }
    } else throw new Error("Only regular files and folders can be uploaded.");
  }
  async download(paths: string[], localDirectory: string): Promise<void> {
    await this.exclusive(async () => {
      for (const path of paths)
        await this.downloadTree(
          path,
          join(localDirectory, safeName(posix.basename(path))),
        );
    });
  }
  private async downloadTree(remote: string, local: string): Promise<void> {
    const info = await this.stat(remote);
    if (info.isSymbolicLink())
      throw new Error(
        "Navigate to the original file to download a symbolic link.",
      );
    if (info.isDirectory()) {
      await mkdir(local);
      for (const e of await this.entries(remote))
        await this.downloadTree(
          destinationPath(remote, e.filename),
          join(local, safeName(e.filename)),
        );
    } else if (info.isFile()) {
      const temporary = `${local}.findssh-${randomUUID()}.partial`;
      try {
        await pipeline(
          this.remote().createReadStream(remote),
          this.meter(posix.basename(remote), "download", info.size),
          createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
        );
        // Exclusive copy preserves existing local files, including symlinks.
        const { copyFile, constants } = await import("node:fs/promises");
        await copyFile(temporary, local, constants.COPYFILE_EXCL);
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
    } else throw new Error("Only regular files and folders can be downloaded.");
  }
  async copy(paths: string[], directory: string, move: boolean): Promise<void> {
    await this.exclusive(async () => {
      const canonicalDirectory = await this.realpath(directory);
      for (const path of paths) {
        mutationPath(path);
        const target = destinationPath(
          canonicalDirectory,
          posix.basename(path),
        );
        assertNotDescendant(await this.realpath(path), target);
        await this.requireNew(target);
        if (move) await this.movePath(path, target);
        else await this.copyTree(path, target);
      }
    });
  }
  private async copyTree(source: string, target: string): Promise<void> {
    const info = await this.stat(source);
    if (info.isSymbolicLink())
      throw new Error("Copy the original file instead of its symbolic link.");
    if (info.isDirectory()) {
      await this.makeDirectory(target);
      for (const e of await this.entries(source))
        await this.copyTree(
          destinationPath(source, e.filename),
          destinationPath(target, e.filename),
        );
    } else if (info.isFile()) {
      const temporary = `${target}.findssh-${randomUUID()}.partial`;
      try {
        await pipeline(
          this.remote().createReadStream(source),
          this.meter(posix.basename(source), "copy", info.size),
          this.remote().createWriteStream(temporary, {
            flags: "wx",
            mode: info.mode & 0o777,
          }),
        );
        await this.requireNew(target);
        await this.movePath(temporary, target);
      } catch (e) {
        await this.unlinkPath(temporary).catch(() => undefined);
        throw e;
      }
    } else throw new Error("Only regular files and folders can be copied.");
  }
  async read(path: string): Promise<TextDocument> {
    const stat = await this.stat(path);
    if (!stat.isFile() || stat.size > MAX_TEXT)
      throw new Error(
        "The editor opens regular UTF-8 text files up to 2 MB. Download this item to open it locally.",
      );
    const stream = this.remote().createReadStream(path);
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_TEXT) {
        stream.destroy();
        throw new Error("This file is too large for the editor.");
      }
      chunks.push(buffer);
    }
    const buffer = Buffer.concat(chunks);
    let content: string;
    try {
      content = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(buffer);
    } catch {
      throw new Error(
        "This is not a UTF-8 text file. Download it to open it locally.",
      );
    }
    if (content.includes("\0"))
      throw new Error(
        "This appears to be a binary file. Download it to open it locally.",
      );
    return { path, content, revision: revision(buffer) };
  }
  async write(document: TextDocument): Promise<TextDocument> {
    return this.exclusive(async () => {
      mutationPath(document.path);
      if (Buffer.byteLength(document.content) > MAX_TEXT)
        throw new Error("The editor supports files up to 2 MB.");
      const previous = await this.read(document.path);
      if (previous.revision !== document.revision)
        throw new Error(
          "This file changed on the server. Reopen it before saving to avoid overwriting those changes.",
        );
      const info = await this.stat(document.path);
      const temporary = `${document.path}.findssh-${randomUUID()}.partial`;
      try {
        await new Promise<void>((resolve, reject) => {
          const stream = this.remote().createWriteStream(temporary, {
            flags: "wx",
            mode: info.mode & 0o777,
          });
          stream.on("error", reject);
          stream.on("close", resolve);
          stream.end(document.content);
        });
        const latest = await this.read(document.path);
        if (latest.revision !== document.revision)
          throw new Error(
            "The server file changed while saving. Reopen it before saving.",
          );
        const s = this.remote();
        await new Promise<void>((resolve, reject) =>
          s.ext_openssh_rename(temporary, document.path, (error) =>
            error
              ? reject(
                  new Error(
                    "This server does not support atomic saves. Download and edit the file locally instead.",
                  ),
                )
              : resolve(),
          ),
        );
      } catch (e) {
        await this.unlinkPath(temporary).catch(() => undefined);
        throw e;
      }
      return { ...document, revision: revision(Buffer.from(document.content)) };
    });
  }
}
