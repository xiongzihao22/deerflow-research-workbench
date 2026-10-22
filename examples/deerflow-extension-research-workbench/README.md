# 竞品调研工作台

基于 DeerFlow 扩展 API 的竞品研究应用，将调研目标、网页证据、对比矩阵和报告历史保存在同一工作台。模型使用主项目配置的通义千问，通过 DeerFlow 原生网页检索与工具调用流程完成调研。

## 功能

- **项目档案**：设置调研目标、最多 6 个竞品和 8 个对比维度；支持多个独立项目。
- **Agent 调研**：一键创建研究会话；Agent 读取项目、检索网页、保存证据、归档报告。可从工作台返回会话查看执行过程及继续追问。
- **证据库**：保存竞品、维度、结论、原文摘录、来源 URL、记录时间和调研会话；支持手动录入、去重和移除。
- **对比矩阵**：按竞品与维度汇总证据，标记资料空缺和不同结论，点击引用编号定位原文。
- **报告版本**：保存不可变证据快照；数据未变化时复用当前版本。任意两版可比较新增、移除和变化的单元格。
- **导出**：导出包含对比表、引用编号及证据来源的 Markdown 报告。
- **账号隔离**：数据访问绑定当前登录用户，报告和证据从属于该用户的项目。

## 本地运行

项目根目录执行：

```powershell
.\Install-ResearchWorkbench.ps1
.\start.cmd -Action Restart
```

填写根目录 `.env` 中的 `DASHSCOPE_API_KEY`，完成本地账号设置，然后访问：

```text
http://localhost:2026/workspace/extensions/local.research-workbench/workspace
```

也可从侧边栏的“竞品调研”进入。首次打开填写项目目标、竞品和维度，点击“开始 Agent 调研”。会话完成后回到工作台刷新，检查证据与冲突，再保存报告版本。

示例任务：比较飞书、钉钉、企业微信面向 50 人团队的知识管理能力；维度设为文档协作、搜索、第三方集成、团队套餐定价。明确比较的套餐和时间范围，有助于减少语义上不可比的结论。

手动证据录入、矩阵、版本对比和导出均可独立使用；Agent 调研需要可用模型服务和联网检索。

## 数据与实现

本地数据库位于 `backend/.deer-flow/research/workbench.sqlite3`。`plugins[].config.storage_path` 可配置其他绝对路径。扩展数据独立于 DeerFlow 核心库；卸载扩展后数据库保留，删除项目则级联删除该项目的当前证据、报告与执行映射，原始聊天会话仍由 DeerFlow 管理。

```text
浏览器插件 → BackendAction → ResearchStore → SQLite
                    ↓
                 AgentRuns → DeerFlow / Qwen → 网页工具
                                                   ↓
                   ModelTool ← add_evidence / save_report
```

- Python 扩展仅依赖公开 `deerflow_extension_api`；页面通过 `BrowserAssets` 注册，不修改 Agent 执行循环。
- Agent 具备 `list_projects`、`get_project`、`add_evidence`、`save_report` 四项业务工具。宿主自动添加命名空间和用户身份。
- SQLite 事务保护去重、容量与版本分配；证据按内容 SHA-256 去重。报告包含完整证据快照，当前证据删除后历史仍可查看。
- “覆盖率”按存在证据的单元格计数；不同结论标记为待核实，属于字面差异检测。记录摘录和来源不等同于已验证结论真实或语义矛盾。
- 创建调研会话采用持久化操作 ID、确定性会话 ID 和宿主幂等提交。未确认的提交可重试同一操作；实际执行状态读取宿主运行记录。
- 页面切换和卸载后丢弃迟到的响应；外部内容作为文本渲染；所有业务操作先验证项目归属。
- 单用户最多 50 项目；单项目 200 证据、100 报告版本、100 次调研。适用于单机本地部署。

`Install-ResearchWorkbench.ps1` 使用可编辑安装，便于在本地直接修改扩展；修改 Python 或静态资源后重启服务并刷新页面。重新同步整个 Python 环境后可再次执行该脚本。其他部署可使用项目原有的 `deerflow extensions install <绝对路径> --yes` 安装扩展快照，再重启。

## 验证

```powershell
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_research_workbench.py -q
```

浏览器测试位于 `frontend/tests/e2e/research-workbench.spec.ts`，使用独立临时 SQLite 与实际插件 API，覆盖创建项目、证据录入、报告对比、导出、重载持久性及跨用户拒绝。真实模型表现通过配置 API Key 后的完整调研任务验证。
