import { _electron as electron } from "@playwright/test";
import { readFile } from "node:fs/promises";
const application = await electron.launch({ args: [".", "--no-sandbox"] });
try {
  const page = await application.firstWindow();
  await page.setViewportSize({ width: 1024, height: 1024 });
  const svg = await readFile("assets/icon.svg", "utf8");
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
  );
  await page.screenshot({ path: "assets/icon.png", omitBackground: true });
} finally {
  await application.close();
}
