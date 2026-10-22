import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

import { expect, test } from "@playwright/test";

let gateway: ChildProcess;
let base: string;
test.beforeAll(async ({ request }) => {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  base = `http://127.0.0.1:${address.port}`;
  const backend = path.resolve(process.cwd(), "../backend");
  gateway = spawn(
    path.join(
      backend,
      process.platform === "win32"
        ? ".venv/Scripts/python.exe"
        : ".venv/bin/python",
    ),
    ["-m", "extension_test_fixtures.research_gateway", String(address.port)],
    { cwd: backend, stdio: "pipe" },
  );
  let diagnostics = "";
  gateway.stderr?.on("data", (chunk) => {
    diagnostics += String(chunk);
  });
  await expect
    .poll(
      async () => {
        if (gateway.exitCode !== null) throw new Error(diagnostics);
        return request
          .get(`${base}/api/plugins`)
          .then((r) => r.status())
          .catch(() => 0);
      },
      { timeout: 60_000 },
    )
    .toBe(200);
});
test.afterAll(async () => {
  if (gateway?.exitCode === null) {
    const stopped = new Promise<void>((resolve) =>
      gateway.once("exit", () => resolve()),
    );
    gateway.kill();
    await stopped;
  }
});

test("research workspace: project, evidence, version diff, persistence, owner isolation", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 1000 });
  async function mount() {
    await page.goto(base);
    await page.evaluate(async () => {
      const descriptors = await fetch("/api/plugins").then((r) => r.json());
      const descriptor = descriptors[0];
      const pluginModule = await import(
        /* webpackIgnore: true */ descriptor.entry
      );
      const controller = new AbortController();
      const root = document
        .querySelector("#root")!
        .attachShadow({ mode: "open" });
      pluginModule.default.surfaces[0].mount(root, {
        locale: "zh-CN",
        signal: controller.signal,
        async callBackend(name: string, payload: unknown) {
          const response = await fetch(
            `/api/plugins/local.research-workbench/actions/${name}`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-deerflow-plugin-viewer": "alice",
              },
              body: JSON.stringify(payload),
            },
          );
          if (!response.ok)
            throw new Error(`Action ${name}: ${response.status}`);
          return response.json();
        },
      });
    });
  }
  await mount();
  await page.getByLabel("项目名称", { exact: true }).fill("协作平台选型");
  await page
    .getByLabel("调研目标", { exact: true })
    .fill("比较团队套餐的价格与协作能力");
  await page.getByLabel("竞品（每行一个，最多 6 个）").fill("产品 A\n产品 B");
  await page.getByLabel("对比维度（每行一个，最多 8 个）").fill("定价\n协作");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "竞品对比矩阵" }),
  ).toBeVisible();
  async function add(value: string) {
    await page.getByText("手动补充证据", { exact: true }).click();
    await page.getByLabel("结论", { exact: true }).fill(value);
    await page
      .getByLabel("来源链接", { exact: true })
      .fill("https://example.com/pricing");
    await page.getByLabel("原文摘录", { exact: true }).fill(`团队版 ${value}`);
    await page.getByRole("button", { name: "保存证据", exact: true }).click();
    await expect(
      page
        .getByRole("link", { name: "https://example.com/pricing", exact: true })
        .first(),
    ).toBeVisible();
  }
  await add("每月 99 元");
  await page.getByRole("button", { name: "保存报告版本" }).click();
  await expect(page.getByRole("status")).toHaveText("已保存 V1");
  await add("每月 129 元");
  await expect(page.getByText("待核实", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存报告版本" }).click();
  await expect(page.getByRole("status")).toHaveText("已保存 V2");
  await page.getByRole("button", { name: "对比版本", exact: true }).click();
  await expect(page.getByText("1 个单元格发生变化")).toBeVisible();
  await page.getByRole("button", { name: "查看", exact: true }).last().click();
  await expect(page.locator("pre.preview")).toContainText("每月 99 元");
  await expect(page.locator("pre.preview")).not.toContainText("每月 129 元");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 Markdown" }).first().click();
  expect((await downloadPromise).suggestedFilename()).toBe("research-v2.md");
  await page.screenshot({
    path: "../logs/research-workbench.png",
    fullPage: true,
  });
  await mount();
  await expect(
    page.getByRole("heading", { name: "协作平台选型", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("待核实", { exact: true })).toBeVisible();
  const alice = await request.post(
    `${base}/api/plugins/local.research-workbench/actions/list_projects`,
    { data: {}, headers: { "x-test-user": "alice" } },
  );
  const projects = await alice.json();
  const bob = await request.post(
    `${base}/api/plugins/local.research-workbench/actions/get_project`,
    { data: { project_id: projects[0].id }, headers: { "x-test-user": "bob" } },
  );
  expect(bob.status()).toBe(422);
  expect(errors).toEqual([]);
});
