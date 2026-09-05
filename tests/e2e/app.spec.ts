import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer } from "../server";
test("connects and manages files in the desktop app", async () => {
  const root = await mkdtemp(join(tmpdir(), "findssh-ui-"));
  const home = join(root, "remote");
  await mkdir(home);
  await writeFile(join(home, "Welcome.md"), "# Hello from your server\n");
  await writeFile(join(home, ".hidden"), "secret");
  await mkdir(join(home, "Documents"));
  await mkdir(join(home, "Photos"));
  const server = await startServer(home);
  const application = await test.step("Launch Electron", () =>
    electron.launch({
      executablePath: process.env.FINDSSH_EXECUTABLE,
      args: [
        ...(process.env.FINDSSH_EXECUTABLE ? [] : ["."]),
        `--user-data-dir=${join(root, "profile")}`,
        "--no-sandbox",
      ],
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" },
    }));
  const appProcess = application.process();
  try {
    await application.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    const page = await application.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(
      page.getByRole("heading", { name: "Your server. Familiar territory." }),
    ).toBeVisible();
    await page.screenshot({ path: "test-results/connect.png" });
    await page.getByLabel("Server address").fill("127.0.0.1");
    await page.getByLabel("Username", { exact: true }).fill("tester");
    await page.getByLabel("Port", { exact: true }).fill(String(server.port));
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Password required" }),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByLabel("Password", { exact: true })
      .fill("test-password");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Welcome.md", { exact: true })).toBeVisible();
    await expect(page.getByText(".hidden", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "New folder", exact: true }).click();
    await page.getByLabel("Folder name").fill("New folder");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("New folder", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Icon view", exact: true }).click();
    await expect(
      page.getByRole("option", { name: "Documents", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("option", { name: "Documents", exact: true })
      .dblclick();
    await expect(page.getByText("This folder is empty")).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(
      page.getByRole("option", { name: "Welcome.md", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("option", { name: "Welcome.md", exact: true })
      .dblclick();
    await page.getByLabel("File contents").fill("Edited from FindSSH\n");
    await page.getByRole("button", { name: "Save to server" }).click();
    await expect(
      page.getByRole("button", { name: "Save to server" }),
    ).toBeDisabled();
    expect(await readFile(join(home, "Welcome.md"), "utf8")).toBe(
      "Edited from FindSSH\n",
    );
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "List view", exact: true }).click();
    await page
      .getByText("Welcome.md", { exact: true })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename…", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Name", { exact: true })
      .fill("Renamed.md");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Renamed.md", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "More actions", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Show hidden files" }).click();
    await expect(page.getByText(".hidden", { exact: true })).toBeVisible();
    await page.getByLabel("Search this folder").fill("renamed");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.getByRole("button", { name: "Clear search" }).click();
    await page.screenshot({ path: "test-results/browser.png" });
    await page
      .getByText("New folder", { exact: true })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete permanently…" }).click();
    await expect(page.getByText("New folder", { exact: true })).toHaveCount(0);
    await page.getByText("Renamed.md", { exact: true }).click();
    await application.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.getMenuItemById("native-copy")?.click(),
    );
    await expect(page.getByText("1 item(s) ready to copy")).toBeVisible();
    await page.getByText("Documents", { exact: true }).dblclick();
    await expect(page.getByText("This folder is empty")).toBeVisible();
    await application.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.getMenuItemById("native-paste")?.click(),
    );
    await expect(page.getByText("Renamed.md", { exact: true })).toBeVisible();
    expect(await readFile(join(home, "Documents/Renamed.md"), "utf8")).toBe(
      "Edited from FindSSH\n",
    );
    await page.getByText("Renamed.md", { exact: true }).dblclick();
    await page.getByLabel("File contents").fill("Do not lose this draft");
    await expect(page.getByText(/Unsaved changes/)).toBeVisible();
    await application.evaluate(({ dialog, app }) => {
      dialog.showMessageBox = async () => ({
        response: 0,
        checkboxChecked: false,
      });
      app.quit();
    });
    await expect(page.getByLabel("File contents")).toHaveValue(
      "Do not lose this draft",
    );
    await test.step("Stop SSH fixture", () => server.close());
    await expect(
      page.getByText(/Connection lost. Your draft is preserved/),
    ).toBeVisible();
    await expect(page.getByLabel("File contents")).toHaveValue(
      "Do not lose this draft",
    );
    await expect(
      page.getByRole("button", { name: "Save to server" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(page.getByLabel("File contents")).toHaveValue(
      "Do not lose this draft",
    );
    expect(errors).toEqual([]);
    const closed = application.waitForEvent("close");
    await application.evaluate(({ dialog, app }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      setTimeout(() => app.quit(), 0);
    });
    await test.step("Wait for confirmed app quit", () => closed);
  } finally {
    if (appProcess.exitCode === null) {
      await application
        .evaluate(({ BrowserWindow }) => {
          for (const window of BrowserWindow.getAllWindows()) window.destroy();
        })
        .catch(() => undefined);
      await test.step("Close desktop test application", () =>
        application.close());
    }
    await test.step("Stop SSH fixture", () => server.close());
    await rm(root, { recursive: true, force: true });
  }
});

test("failed listings on a new server cannot expose the old server's files", async () => {
  const root = await mkdtemp(join(tmpdir(), "findssh-switch-"));
  const home = join(root, "first");
  const secondHome = join(root, "second");
  await mkdir(home);
  await mkdir(secondHome);
  await writeFile(join(home, "First server only.txt"), "first");
  const first = await startServer(home);
  const second = await startServer(secondHome, { denyListing: true });
  const application = await test.step("Launch Electron", () =>
    electron.launch({
      executablePath: process.env.FINDSSH_EXECUTABLE,
      args: [
        ...(process.env.FINDSSH_EXECUTABLE ? [] : ["."]),
        `--user-data-dir=${join(root, "profile")}`,
        "--no-sandbox",
      ],
    }));
  const appProcess = application.process();
  try {
    await application.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    const page = await application.firstWindow();
    async function login(port: number): Promise<void> {
      await page.getByLabel("Server address").fill("127.0.0.1");
      await page.getByLabel("Username", { exact: true }).fill("tester");
      await page.getByLabel("Port", { exact: true }).fill(String(port));
      await page.getByLabel("Password", { exact: false }).fill("test-password");
      await page.getByRole("button", { name: "Connect", exact: true }).click();
    }
    await login(first.port);
    await expect(
      page.getByText("First server only.txt", { exact: true }),
    ).toBeVisible();
    await page.getByText("First server only.txt", { exact: true }).click();
    await page
      .getByRole("button", { name: "Connect to server", exact: true })
      .click();
    await login(second.port);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByText("First server only.txt", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Download selection" }),
    ).toBeDisabled();
  } finally {
    if (appProcess.exitCode === null) {
      await application
        .evaluate(({ BrowserWindow }) => {
          for (const window of BrowserWindow.getAllWindows()) window.destroy();
        })
        .catch(() => undefined);
      await test.step("Close desktop test application", () =>
        application.close());
    }
    await first.close();
    await second.close();
    await rm(root, { recursive: true, force: true });
  }
});
