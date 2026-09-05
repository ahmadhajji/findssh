import { z } from "zod";
export const connectionSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .refine(
      (value) => !/[\s\0/]/.test(value),
      "Enter a hostname or IP address",
    ),
  port: z.number().int().min(1).max(65535),
  username: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .refine((value) => !/[\0\r\n]/.test(value)),
  password: z.string().max(4096).default(""),
  privateKeyPath: z.string().max(4096).default(""),
  passphrase: z.string().max(4096).default(""),
});
export type ConnectionInput = z.infer<typeof connectionSchema>;
export type SavedConnection = Pick<
  ConnectionInput,
  "host" | "port" | "username" | "privateKeyPath"
>;
export const pathSchema = z
  .string()
  .min(1)
  .max(32768)
  .refine(
    (p) => p.startsWith("/") && !p.includes("\0"),
    "Expected an absolute remote path",
  );
export const nameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (n) => n !== "." && n !== ".." && !/[\0/]/.test(n),
    "Use a filename without slashes",
  );
export interface RemoteEntry {
  name: string;
  path: string;
  kind: "directory" | "file" | "symlink" | "other";
  size: number;
  modified: number;
  mode: number;
}
export interface Directory {
  path: string;
  entries: RemoteEntry[];
}
export interface Connection {
  host: string;
  username: string;
  home: string;
  port: number;
}
export interface TextDocument {
  path: string;
  content: string;
  revision: string;
}
export interface Transfer {
  name: string;
  direction: "upload" | "download" | "copy";
  completed: number;
  total: number;
}
export type Prompt = {
  id: string;
  title: string;
  message: string;
  fields: { label: string; secret: boolean }[];
};
export type AppEvent =
  | { kind: "prompt"; prompt: Prompt }
  | { kind: "disconnected"; message: string }
  | { kind: "transfer"; transfer: Transfer | null }
  | { kind: "command"; command: string };
export interface Bootstrap {
  username: string;
  recent: SavedConnection[];
}
export interface API {
  setDirty(dirty: boolean): Promise<void>;
  editText(command: "copy" | "cut" | "paste" | "selectAll"): Promise<void>;
  bootstrap(): Promise<Bootstrap>;
  connect(input: ConnectionInput): Promise<Connection>;
  disconnect(): Promise<void>;
  list(path: string): Promise<Directory>;
  mkdir(parent: string, name: string): Promise<void>;
  rename(path: string, name: string): Promise<void>;
  remove(paths: string[]): Promise<boolean>;
  upload(path: string, folders: boolean): Promise<void>;
  dropUpload(path: string, files: File[]): Promise<void>;
  download(paths: string[]): Promise<void>;
  copy(paths: string[], destination: string, move: boolean): Promise<void>;
  read(path: string): Promise<TextDocument>;
  write(doc: TextDocument): Promise<TextDocument>;
  chooseKey(): Promise<string | null>;
  respond(id: string, answers: string[] | null): Promise<void>;
  onEvent(callback: (event: AppEvent) => void): () => void;
}
declare global {
  interface Window {
    findssh: API;
  }
}
