import ssh2, { type Connection } from "ssh2";
const { Server } = ssh2;
import { generateKeyPairSync } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
export async function startServer(
  home: string,
  options: { port?: number; keyboard?: boolean; denyListing?: boolean } = {},
): Promise<{ port: number; close: () => Promise<void> }> {
  const executable = [
    "/usr/lib/openssh/sftp-server",
    "/usr/libexec/sftp-server",
    "/usr/lib/ssh/sftp-server",
  ].find(existsSync);
  if (!executable)
    throw new Error("Install openssh-sftp-server to run integration tests.");
  const key = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  }).privateKey.export({ type: "pkcs1", format: "pem" });
  const clients = new Set<Connection>(),
    processes = new Set<ChildProcess>();
  const server = new Server({ hostKeys: [key] }, (client) => {
    clients.add(client);
    client.on("error", () => undefined);
    client.on("close", () => clients.delete(client));
    client.on("authentication", (context) => {
      if (options.keyboard && context.method === "keyboard-interactive")
        context.prompt(
          [{ prompt: "Verification code", echo: false }],
          (answers) =>
            answers[0] === "123456" ? context.accept() : context.reject(),
        );
      else if (
        !options.keyboard &&
        context.method === "password" &&
        context.username === "tester" &&
        context.password === "test-password"
      )
        context.accept();
      else
        context.reject(
          options.keyboard ? ["keyboard-interactive"] : ["password"],
        );
    });
    client.on("ready", () =>
      client.on("session", (accept) => {
        const session = accept();
        session.on("subsystem", (acceptSubsystem, reject, info) => {
          if (info.name !== "sftp") {
            reject();
            return;
          }
          const channel = acceptSubsystem();
          const process = spawn(
            executable,
            ["-d", home, ...(options.denyListing ? ["-P", "readdir"] : [])],
            {
              stdio: ["pipe", "pipe", "pipe"],
            },
          );
          processes.add(process);
          channel.pipe(process.stdin);
          process.stdout.pipe(channel);
          process.stderr.resume();
          channel.on("error", () => process.kill());
          process.stdin.on("error", () => undefined);
          process.on("close", () => {
            processes.delete(process);
            channel.end();
          });
          channel.on("close", () => process.kill());
        });
      }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port || 0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected TCP address");
  return {
    port: address.port,
    close: async () => {
      for (const client of clients) client.end();
      for (const process of processes) process.kill();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
