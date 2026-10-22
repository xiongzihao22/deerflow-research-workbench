# DeerFlow 本地运行

DeerFlow 是基于 LangGraph 的 Agent 应用，提供多轮对话、任务规划、子 Agent 协作、网页检索、文件处理、记忆与技能扩展。当前环境使用通义千问 API、SQLite 和本地文件工作区。

## 启动

已加入**竞品调研工作台**：登录后从侧边栏“竞品调研”进入，或访问 [工作台](http://localhost:2026/workspace/extensions/local.research-workbench/workspace)。支持竞品档案、Agent 调研、证据引用、对比矩阵、报告版本差异和 Markdown 导出。详见[功能与使用说明](examples/deerflow-extension-research-workbench/README.md)。

若重新安装了 Python 环境，先执行 `.\Install-ResearchWorkbench.ps1` 恢复扩展，然后启动服务。

1. 编辑根目录 `.env`，在 `DASHSCOPE_API_KEY=` 后填入阿里云百炼中国内地地域的 API Key。
2. 双击根目录 `start.cmd`，或在 PowerShell 中运行：

```powershell
cd deerflow-research-workbench
.\start.cmd
```

3. 打开 http://localhost:2026，按页面提示完成首次账户设置，然后进入对话界面。

默认模型为 `qwen-plus`。模型名称、API 地址和思考模式在 `config.yaml` 的 `models` 段配置；API Key 从 `.env` 读取。国际地域或 Coding Plan 的 Key 需要配套修改 API 地址和模型配置。

模型接入资料：[阿里云百炼 API Key](https://www.alibabacloud.com/help/zh/model-studio/get-api-key)、[思考模式](https://www.alibabacloud.com/help/zh/model-studio/deep-thinking)。

## 管理服务

```powershell
# 查询服务状态
.\start.cmd -Action Status

# 修改配置后重启
.\start.cmd -Action Restart

# 停止本项目启动的服务
.\start.cmd -Action Stop
```

启动脚本在后台运行服务，日志保存在 `logs/`。前端首次访问会进行开发编译。

| 服务 | 地址 | 入口 |
| --- | --- | --- |
| 网页和统一 API | http://localhost:2026 | nginx |
| 前端开发服务 | http://127.0.0.1:3000 | `frontend/scripts/dev.mjs` |
| 后端 API | http://127.0.0.1:8001 | `app.gateway.app:app` |
| 后端就绪检查 | http://localhost:8001/health/ready | SQLite 和运行时状态 |

## 本地目录

- `frontend/`：Next.js 前端。
- `backend/app/gateway/`：FastAPI 路由和应用启动。
- `backend/packages/harness/deerflow/`：Agent、工具、记忆、工作区与运行时。
- `skills/`：可扩展技能。
- `config.yaml`：模型、工具、存储和运行时配置。
- `extensions_config.json`：MCP 和扩展配置。
- `backend/.deer-flow/`：本地运行数据。
- `.tools/`：项目使用的便携工具。
- `Local-Environment.ps1`：当前 PowerShell 会话的工具路径。

网页检索使用上游默认 DDGS 工具，网页读取使用 Jina Reader。当前本地工作区支持文件读写；主机 shell 执行保持上游默认关闭，`sandbox.allow_host_bash` 控制该功能。

## 开发环境

```powershell
cd deerflow-research-workbench
. .\Local-Environment.ps1
python scripts/check.py

cd frontend
pnpm dev --hostname 127.0.0.1
```

日常启动使用 `start.cmd`，会同时启动三个服务。开发时需先停止已有服务，避免端口重复占用。

安装 Python 3.12+、Node.js 22+、nginx、uv 和 pnpm，并将工具加入 PATH。脚本也支持 `.tools/python/`、`.tools/node/` 和 `.tools/nginx-1.31.7/` 下的便携程序。后端依赖安装在 `backend/.venv`，pnpm 使用仓库指定的 10.26.2。

如需使用其他安装位置，可设置 `DEERFLOW_PYTHON`、`DEERFLOW_NODE`、`DEERFLOW_NGINX` 环境变量，或在已被 Git 忽略的 `.local/runtime.ps1` 中设置这些变量。项目和数据目录均相对于脚本所在目录解析。完整安装说明见 `Install.md` 和 `backend/docs/CONFIGURATION.md`。

需要重新安装应用依赖时，运行 `powershell -ExecutionPolicy Bypass -File .\Install-LocalDependencies.ps1`。脚本读取上游锁文件并校验包哈希，默认使用清华 PyPI 镜像；可传 `-IndexUrl https://pypi.org/simple` 切换到 PyPI。

源码版本见 `LOCAL_REPRODUCTION.json`。
