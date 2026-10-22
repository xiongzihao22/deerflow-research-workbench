# 竞品调研工作台 · DeerFlow Research Workbench

基于 **DeerFlow、LangGraph 与通义千问** 的竞品研究应用，将自然语言调研、网页证据、结构化对比和报告版本管理连接成完整工作流。

## 功能

| 功能 | 说明 |
| --- | --- |
| 调研项目 | 设置目标、竞品与比较维度，管理多个研究项目 |
| Agent 调研 | 创建研究会话，通过网页检索与业务工具采集、记录信息 |
| 证据库 | 保存结论、原文摘录、来源链接、记录时间和研究会话；支持去重与手动补充 |
| 对比矩阵 | 按竞品和维度汇总结论，标记证据缺失和不同结论，引用可定位到原文 |
| 报告版本 | 保存不可变证据快照，比较不同版本的新增、移除和变化 |
| 报告导出 | 导出包含对比表与来源引用的 Markdown 报告 |
| 用户隔离 | 基于登录用户校验项目归属，隔离证据、报告与执行记录 |

## 工作流程

```mermaid
flowchart LR
    A[创建调研项目] --> B[启动 Agent 会话]
    B --> C[检索与阅读网页]
    C --> D[保存结构化证据]
    D --> E[竞品对比矩阵]
    E --> F[报告版本快照]
    F --> G[版本差异与导出]
```

例如，比较飞书、钉钉和企业微信面向团队的知识管理能力，设置文档协作、搜索、第三方集成、套餐定价等维度。明确关注的用户、套餐与时间范围后，启动调研并检查证据与差异。

## 技术实现

- **Agent**：通过 DeerFlow 公开 `AgentRuns` 接口创建会话、提交任务并查询执行状态，复用 LangGraph 执行流程和通义千问模型配置。
- **业务工具**：`list_projects`、`get_project`、`add_evidence`、`save_report`，由宿主注入用户身份并执行工具调用。
- **后端**：Python、FastAPI 插件动作、SQLite 事务；内容哈希去重，版本快照保存完整证据。
- **前端**：在 Next.js 工作区内加载独立浏览器插件，提供项目表单、证据卡片、矩阵、版本比较和导出。
- **任务提交**：使用持久化操作 ID、确定性会话 ID 和宿主幂等提交，支持未确认请求的重试。
- **结果呈现**：证据覆盖按单元格计数，不同结论按字面差异提示待核实，保留原文与来源供复查。

## 运行

### 当前 Windows 本地环境

```powershell
cd E:\std\deerflow
.\start.cmd
```

在根目录 `.env` 中设置 `DASHSCOPE_API_KEY`，然后打开 `http://localhost:2026` 完成账号设置。配置修改后使用 `start.cmd -Action Restart` 重启。

工作台入口：`http://localhost:2026/workspace/extensions/local.research-workbench/workspace`，也可从侧边栏“竞品调研”进入。

详细环境说明见 [Windows 本地运行](README.local.zh-CN.md)。本地脚本使用已安装的便携运行时；首次克隆的其他机器按下方步骤安装。

### 新环境部署

先按 [DeerFlow 安装说明](Install.md) 安装 Python 3.12+、Node.js 22+、uv、pnpm 及代理服务，再完成基础配置与依赖安装：

```bash
git clone https://github.com/xiongzihao22/deerflow-research-workbench.git
cd deerflow-research-workbench
make config
make install
```

在根目录 `config.yaml` 的 `models` 中配置通义千问：

```yaml
models:
  - name: qwen-plus
    display_name: 通义千问 Plus
    use: deerflow.models.patched_deepseek:PatchedChatDeepSeek
    model: qwen-plus
    api_base: https://dashscope.aliyuncs.com/compatible-mode/v1
    api_key: $DASHSCOPE_API_KEY
    supports_thinking: true
    when_thinking_enabled:
      extra_body:
        enable_thinking: true
    when_thinking_disabled:
      extra_body:
        enable_thinking: false
```

将 `DASHSCOPE_API_KEY` 写入本地 `.env`，使用项目的扩展管理命令安装工作台，然后启动服务：

```bash
make extension-install SOURCE="$(pwd)/examples/deerflow-extension-research-workbench"
make dev
```

模型服务与联网检索用于自动调研；项目管理、手动证据录入、版本比较和导出可以独立使用。

## 目录

```text
examples/deerflow-extension-research-workbench/
  deerflow_extension_research/
    __init__.py       # 插件注册、业务工具与 AgentRuns 接入
    store.py          # 项目、证据、报告快照与幂等记录
    static/           # 工作台界面
    ui_manifest.json  # 浏览器资源声明
backend/tests/test_research_workbench.py
frontend/tests/e2e/research-workbench.spec.ts
Install-ResearchWorkbench.ps1
```

完整功能与存储配置见 [工作台说明](examples/deerflow-extension-research-workbench/README.md)。默认业务数据库为 `backend/.deer-flow/research/workbench.sqlite3`。

## 开源基础

本项目在 [bytedance/deer-flow](https://github.com/bytedance/deer-flow) 基础上增加竞品调研工作台。业务扩展通过公开插件 API 接入；原框架说明见 [DeerFlow README](README.upstream.md)，许可证见 [LICENSE](LICENSE)。
