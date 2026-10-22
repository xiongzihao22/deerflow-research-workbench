export function mountResearch(root, context) {
  const zh = context.locale.startsWith("zh");
  const t = (cn, en) => (zh ? cn : en);
  let disposed = false,
    generation = 0,
    listGeneration = 0,
    selected = null;
  const pendingRuns = new Map();
  const active = () => !disposed && !context.signal.aborted;
  const el = (tag, text = "", attrs = {}) => {
    const node = document.createElement(tag);
    node.textContent = text;
    for (const [key, value] of Object.entries(attrs))
      node.setAttribute(key, value);
    return node;
  };
  const listen = (node, event, fn) =>
    node.addEventListener(event, fn, { signal: context.signal });
  const button = (label, fn, cls = "") => {
    const node = el("button", label, { type: "button", class: cls });
    listen(node, "click", () => void run(node, fn));
    return node;
  };
  const status = el("p", "", { role: "status", class: "notice" });
  const error = el("p", "", { role: "alert", class: "error" });
  async function run(node, fn) {
    if (!active()) return;
    node.disabled = true;
    error.textContent = "";
    try {
      await fn();
    } catch (cause) {
      if (active())
        error.textContent =
          cause instanceof Error
            ? cause.message
            : t("操作失败，请重试", "Operation failed; please retry");
    } finally {
      if (active()) node.disabled = false;
    }
  }
  const call = (name, payload) => context.callBackend(name, payload);
  const style = el("link", "", {
    rel: "stylesheet",
    crossorigin: "use-credentials",
    href: new URL("./style.css", import.meta.url).href,
  });
  const page = el("main", "", { class: "research" });
  const hero = el("header", "", { class: "hero" });
  hero.append(
    el("span", "RESEARCH WORKBENCH", { class: "eyebrow" }),
    el(
      "h1",
      t("让竞品结论，有据可查", "Competitor insights, backed by evidence"),
    ),
    el(
      "p",
      t(
        "定义问题 → Agent 检索 → 证据对比 → 报告归档",
        "Define → Research → Compare evidence → Archive reports",
      ),
    ),
  );
  const toolbar = el("div", "", { class: "toolbar" });
  const picker = el("select", "", {
    "aria-label": t("调研项目", "Research project"),
  });
  const detail = el("section");
  toolbar.append(
    picker,
    button(t("刷新", "Refresh"), async () => {
      await loadProjects();
      if (selected) await loadProject(selected);
    }),
    button(t("新建项目", "New project"), async () => {
      creation.hidden = !creation.hidden;
    }),
  );
  const creation = el("form", "", { class: "panel create" });
  creation.hidden = true;
  function input(parent, label, tag = "input", attrs = {}) {
    const wrap = el("label", label);
    const field = el(tag, "", { "aria-label": label, required: "", ...attrs });
    wrap.append(field);
    parent.append(wrap);
    return field;
  }
  creation.append(el("h2", t("创建调研项目", "Create a research project")));
  const name = input(creation, t("项目名称", "Project name"), "input", {
    maxlength: "120",
    placeholder: t(
      "例如：团队知识库产品选型",
      "Team knowledge platform selection",
    ),
  });
  const brief = input(creation, t("调研目标", "Research brief"), "textarea", {
    maxlength: "2000",
    placeholder: t(
      "目标用户、关注的问题、比较的套餐或时间范围",
      "Audience, questions, plan or time period",
    ),
  });
  const competitors = input(
    creation,
    t("竞品（每行一个，最多 6 个）", "Competitors (one per line, up to 6)"),
    "textarea",
  );
  const dimensions = input(
    creation,
    t("对比维度（每行一个，最多 8 个）", "Dimensions (one per line, up to 8)"),
    "textarea",
  );
  dimensions.value = t(
    "目标用户\n核心功能\n定价\n集成能力",
    "Audience\nCore features\nPricing\nIntegrations",
  );
  const create = el("button", t("创建项目", "Create project"), {
    type: "submit",
    class: "primary",
  });
  creation.append(create);
  listen(creation, "submit", (event) => {
    event.preventDefault();
    void run(create, async () => {
      const lines = (field) =>
        field.value
          .split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean);
      const data = await call("create_project", {
        name: name.value,
        brief: brief.value,
        competitors: lines(competitors),
        dimensions: lines(dimensions),
      });
      if (!active()) return;
      selected = data.id;
      creation.hidden = true;
      creation.reset();
      await loadProjects();
      await loadProject(data.id);
    });
  });
  page.append(hero, toolbar, status, error, creation, detail);
  root.append(style, page);
  listen(picker, "change", () => {
    selected = picker.value;
    void run(picker, () => loadProject(selected));
  });

  async function loadProjects() {
    const ticket = ++listGeneration;
    const projects = await call("list_projects", {});
    if (!active() || ticket !== listGeneration) return;
    if (!projects.some((p) => p.id === selected))
      selected = projects[0]?.id ?? null;
    picker.replaceChildren(
      ...projects.map((p) => el("option", p.name, { value: p.id })),
    );
    if (selected) picker.value = selected;
    else {
      creation.hidden = false;
      detail.replaceChildren(
        el(
          "p",
          t(
            "创建第一个项目，开始积累可追溯的竞品资料。",
            "Create your first project to build an evidence library.",
          ),
        ),
      );
    }
  }
  async function loadProject(id) {
    const ticket = ++generation;
    status.textContent = t("加载中…", "Loading…");
    const data = await call("get_project", { project_id: id });
    if (!active() || ticket !== generation || selected !== id) return;
    status.textContent = "";
    render(data, ticket);
  }
  const valid = (id, ticket) =>
    active() && selected === id && generation === ticket;
  function download(text, filename) {
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown;charset=utf-8" }),
    );
    const anchor = el("a", "", { href: url, download: filename });
    root.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function render(data, ticket) {
    const id = data.project.id;
    const header = el("section", "", { class: "panel" });
    header.append(
      el("h2", data.project.name),
      el("p", data.project.brief, { class: "muted" }),
    );
    const controls = el("div", "", { class: "actions" });
    controls.append(
      button(
        t("开始 Agent 调研", "Start Agent research"),
        async () => {
          const pending =
            pendingRuns.get(id) ??
            data.runs.find((r) => !r.run_id)?.operation_id ??
            crypto.randomUUID();
          pendingRuns.set(id, pending);
          const started = await call("start_research", {
            project_id: id,
            operation_id: pending,
          });
          pendingRuns.delete(id);
          if (valid(id, ticket)) {
            await loadProject(id);
            if (active() && selected === id)
              await context.openConversation(started.thread_id);
          }
        },
        "primary",
      ),
      button(t("保存报告版本", "Save report version"), async () => {
        const report = await call("save_report", { project_id: id });
        if (valid(id, ticket)) {
          await loadProject(id);
          status.textContent = t(
            `已保存 V${report.version}`,
            `Saved V${report.version}`,
          );
        }
      }),
    );
    header.append(controls);
    const metrics = el("div", "", { class: "metrics" });
    const m = data.metrics;
    for (const [value, label] of [
      [`${m.covered}/${m.total}`, t("维度证据覆盖", "Cells with evidence")],
      [data.evidence.length, t("已记录证据", "Evidence entries")],
      [m.conflicts, t("待核实差异", "Potential conflicts")],
      [data.reports.length, t("报告版本", "Report versions")],
    ]) {
      const card = el("div", "", { class: "metric" });
      card.append(el("strong", String(value)), el("span", label));
      metrics.append(card);
    }
    const matrix = el("section", "", { class: "panel matrix" });
    matrix.append(el("h2", t("竞品对比矩阵", "Comparison matrix")));
    const table = el("table");
    const head = el("tr");
    head.append(el("th", t("对比维度", "Dimension")));
    for (const c of data.project.competitors) head.append(el("th", c));
    const thead = el("thead");
    thead.append(head);
    table.append(thead);
    const tbody = el("tbody");
    for (const dim of data.project.dimensions) {
      const row = el("tr");
      row.append(el("th", dim));
      for (const c of data.project.competitors) {
        const cell = data.cells.find(
          (x) => x.competitor === c && x.dimension === dim,
        );
        const td = el("td", "", { class: cell.status });
        const label =
          cell.status === "missing"
            ? t("待补充证据", "Missing evidence")
            : cell.status === "conflict"
              ? t("待核实", "Needs review")
              : t("有证据", "Evidence available");
        td.append(el("span", label, { class: "badge" }));
        for (const value of cell.values) td.append(el("p", value));
        for (const eid of cell.evidence_ids) {
          const n = data.evidence.findIndex((e) => e.id === eid) + 1;
          td.append(
            button(
              `[${n}]`,
              async () => {
                root
                  .querySelector(`[data-evidence="${eid}"]`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              },
              "citation",
            ),
          );
        }
        row.append(td);
      }
      tbody.append(row);
    }
    table.append(tbody);
    matrix.append(table);
    const evidencePanel = el("section", "", { class: "panel" });
    evidencePanel.append(el("h2", t("证据库", "Evidence library")));
    const add = el("details");
    add.append(el("summary", t("手动补充证据", "Add evidence manually")));
    const form = el("form", "", { class: "evidence-form" });
    const competitor = input(form, t("竞品", "Competitor"), "select");
    competitor.append(
      ...data.project.competitors.map((c) => el("option", c, { value: c })),
    );
    const dimension = input(form, t("维度", "Dimension"), "select");
    dimension.append(
      ...data.project.dimensions.map((d) => el("option", d, { value: d })),
    );
    const value = input(form, t("结论", "Finding"), "input", {
      maxlength: "300",
    });
    const url = input(form, t("来源链接", "Source URL"), "input", {
      type: "url",
      maxlength: "2000",
    });
    const quote = input(form, t("原文摘录", "Source excerpt"), "textarea", {
      maxlength: "1200",
    });
    const save = el("button", t("保存证据", "Save evidence"), {
      type: "submit",
    });
    form.append(save);
    add.append(form);
    evidencePanel.append(add);
    listen(form, "submit", (event) => {
      event.preventDefault();
      void run(save, async () => {
        await call("add_evidence", {
          project_id: id,
          competitor: competitor.value,
          dimension: dimension.value,
          value: value.value,
          url: url.value,
          quote: quote.value,
        });
        if (valid(id, ticket)) await loadProject(id);
      });
    });
    data.evidence.forEach((item, i) => {
      const card = el("article", "", {
        class: "evidence",
        "data-evidence": item.id,
      });
      card.append(
        el("h3", `[${i + 1}] ${item.competitor} · ${item.dimension}`),
        el("p", item.value),
        el("blockquote", item.quote),
        el("a", item.url, {
          href: item.url,
          target: "_blank",
          rel: "noopener noreferrer",
        }),
        el(
          "p",
          t("记录于 ", "Recorded ") +
            new Date(item.recorded_at).toLocaleString(),
          { class: "muted" },
        ),
      );
      const actions = el("div", "", { class: "actions" });
      if (item.thread_id)
        actions.append(
          button(t("查看调研会话", "Open research conversation"), () =>
            context.openConversation(item.thread_id),
          ),
        );
      let confirm = false;
      const remove = button(t("移除证据", "Remove evidence"), async () => {
        if (!confirm) {
          confirm = true;
          remove.textContent = t(
            "确认移除（保留历史报告）",
            "Confirm removal (reports retained)",
          );
          return;
        }
        await call("delete_evidence", { project_id: id, evidence_id: item.id });
        if (valid(id, ticket)) await loadProject(id);
      });
      actions.append(remove);
      card.append(actions);
      evidencePanel.append(card);
    });
    if (!data.evidence.length)
      evidencePanel.append(
        el(
          "p",
          t(
            "运行 Agent 调研，或补充已查阅的资料。",
            "Start Agent research or add sources you have read.",
          ),
          { class: "muted" },
        ),
      );
    const reports = el("section", "", { class: "panel" });
    reports.append(
      el("h2", t("报告与版本差异", "Reports and version changes")),
    );
    const preview = el("pre", "", { class: "preview" });
    preview.hidden = true;
    for (const report of data.reports) {
      const row = el("div", "", { class: "report-row" });
      row.append(
        el(
          "span",
          `V${report.version} · ${new Date(report.created_at).toLocaleString()}`,
        ),
      );
      row.append(
        button(t("查看", "View"), async () => {
          const result = await call("get_report", {
            project_id: id,
            report_id: report.id,
          });
          if (valid(id, ticket)) {
            preview.hidden = false;
            preview.textContent = result.markdown;
          }
        }),
        button(t("导出 Markdown", "Export Markdown"), async () => {
          const result = await call("get_report", {
            project_id: id,
            report_id: report.id,
          });
          if (valid(id, ticket))
            download(result.markdown, `research-v${report.version}.md`);
        }),
      );
      reports.append(row);
    }
    if (data.reports.length >= 2) {
      const comparison = el("div", "", { class: "actions" });
      const before = el("select", "", {
          "aria-label": t("旧版本", "Before version"),
        }),
        after = el("select", "", {
          "aria-label": t("新版本", "After version"),
        });
      for (const report of data.reports) {
        before.append(el("option", `V${report.version}`, { value: report.id }));
        after.append(el("option", `V${report.version}`, { value: report.id }));
      }
      before.value = data.reports[1].id;
      const diff = el("div", "", { class: "diff" });
      comparison.append(
        before,
        after,
        button(t("对比版本", "Compare versions"), async () => {
          const result = await call("compare_reports", {
            project_id: id,
            before: before.value,
            after: after.value,
          });
          if (!valid(id, ticket)) return;
          diff.replaceChildren(
            el(
              "p",
              t(
                `${result.changes.length} 个单元格发生变化`,
                `${result.changes.length} changed cells`,
              ),
            ),
          );
          for (const change of result.changes) {
            const card = el("article");
            card.append(
              el(
                "h3",
                `${change.after.competitor} · ${change.after.dimension}`,
              ),
              el("p", `− ${change.before.values.join(" / ") || "—"}`, {
                class: "removed",
              }),
              el("p", `+ ${change.after.values.join(" / ") || "—"}`, {
                class: "added",
              }),
            );
            diff.append(card);
          }
        }),
      );
      reports.append(comparison, diff);
    }
    reports.append(preview);
    const runs = el("section", "", { class: "panel" });
    runs.append(el("h2", t("调研执行记录", "Research runs")));
    const runList = el("div");
    for (const item of data.runs) {
      if (item.run_id)
        runList.append(
          button(
            t("打开调研会话 · ", "Open conversation · ") +
              new Date(item.created_at).toLocaleString(),
            () => context.openConversation(item.thread_id),
          ),
        );
      else
        runList.append(
          el(
            "p",
            t(
              "任务创建尚未确认；点击“开始 Agent 调研”重试同一任务。",
              "Admission unconfirmed; Start Agent research retries the same operation.",
            ),
          ),
        );
    }
    runs.append(
      runList,
      button(t("查询执行状态", "Check run status"), async () => {
        const states = await call("research_status", { project_id: id });
        if (!valid(id, ticket)) return;
        runList.replaceChildren(
          ...states.map((s) =>
            button(`${s.status} · ${s.run_id?.slice(0, 8) ?? "…"}`, () =>
              context.openConversation(s.thread_id),
            ),
          ),
        );
      }),
    );
    let confirmed = false;
    const remove = button(
      t("删除调研项目", "Delete research project"),
      async () => {
        if (!confirmed) {
          confirmed = true;
          remove.textContent = t(
            "确认删除项目、证据与报告",
            "Confirm deletion of project, evidence and reports",
          );
          return;
        }
        await call("delete_project", { project_id: id });
        if (valid(id, ticket)) {
          selected = null;
          await loadProjects();
          if (selected) await loadProject(selected);
        }
      },
      "danger",
    );
    detail.replaceChildren(
      header,
      metrics,
      matrix,
      evidencePanel,
      reports,
      runs,
      remove,
    );
  }
  void run(picker, async () => {
    await loadProjects();
    if (selected) await loadProject(selected);
  });
  return {
    dispose() {
      disposed = true;
      generation++;
      listGeneration++;
      selected = null;
      pendingRuns.clear();
      root.replaceChildren();
    },
  };
}

export default {
  apiVersion: 1,
  module: "research-workbench.v1",
  icon: "search",
  surfaces: [
    {
      id: "workspace",
      slot: "page",
      title: "Research Workbench",
      navigation: {
        label: "Research workbench",
        labelZh: "竞品调研",
        icon: "search",
      },
      mount: mountResearch,
    },
  ],
};
