"""Business regressions for the competitor research extension."""

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "examples/deerflow-extension-research-workbench"))
from deerflow_extension_research import ResearchStore, install  # noqa: E402


@pytest.fixture
def store(tmp_path):
    return ResearchStore(tmp_path / "research.sqlite3")


def project(store, owner="alice"):
    return store.apply("create_project", {"name": "协作产品", "brief": "比较套餐与协作能力", "competitors": ["产品 A", "产品 B"], "dimensions": ["定价", "协作"]}, owner)["id"]


def evidence(pid, **changes):
    return {"project_id": pid, "competitor": "产品 A", "dimension": "定价", "value": "每月 99 元", "url": "https://example.com/pricing", "quote": "团队版每月 99 元", **changes}


def test_persistence_deduplication_and_coverage(store):
    pid = project(store)
    first = store.apply("add_evidence", evidence(pid), "alice")
    assert store.apply("add_evidence", evidence(pid), "alice")["id"] == first["id"]
    reopened = ResearchStore(store.path)
    data = reopened.apply("get_project", {"project_id": pid}, "alice")
    assert len(data["evidence"]) == 1
    assert data["metrics"] == {"covered": 1, "total": 4, "conflicts": 0}
    assert data["evidence"][0]["recorded_at"]


def test_conflicts_and_immutable_report_diff(store):
    pid = project(store)
    store.apply("add_evidence", evidence(pid), "alice")
    before = store.apply("save_report", {"project_id": pid}, "alice")
    store.apply("add_evidence", evidence(pid, value="每月 129 元", quote="新版 129 元"), "alice")
    after = store.apply("save_report", {"project_id": pid}, "alice")
    diff = store.apply("compare_reports", {"project_id": pid, "before": before["id"], "after": after["id"]}, "alice")
    assert len(diff["changes"]) == 1
    assert diff["changes"][0]["kind"] == "changed"
    assert diff["changes"][0]["after"]["status"] == "conflict"
    old = store.apply("get_report", {"project_id": pid, "report_id": before["id"]}, "alice")
    assert old["snapshot"]["metrics"]["conflicts"] == 0
    assert "https://example.com/pricing" in old["markdown"]
    assert store.apply("save_report", {"project_id": pid}, "alice")["id"] == after["id"]


@pytest.mark.parametrize("action,extra", [("get_project", {}), ("add_evidence", {"competitor": "产品 A", "dimension": "定价", "value": "x", "url": "https://example.com", "quote": "x"}), ("save_report", {}), ("delete_project", {})])
def test_cross_owner_access_rejected(store, action, extra):
    pid = project(store)
    with pytest.raises(ValueError, match="unavailable"):
        store.apply(action, {"project_id": pid, **extra}, "bob")
    assert store.apply("list_projects", {}, "bob") == []


@pytest.mark.parametrize("changes", [{"url": "javascript:alert(1)"}, {"url": "https://user:pass@example.com"}, {"dimension": "不存在"}, {"quote": ""}, {"owner": "bob"}])
def test_evidence_validation(store, changes):
    with pytest.raises(ValueError):
        store.apply("add_evidence", evidence(project(store), **changes), "alice")


def test_concurrent_evidence_retry_is_idempotent(store):
    pid = project(store)
    with ThreadPoolExecutor(max_workers=4) as pool:
        ids = list(pool.map(lambda _: store.apply("add_evidence", evidence(pid), "alice")["id"], range(8)))
    assert len(set(ids)) == 1


def test_report_keeps_evidence_after_removal(store):
    pid = project(store)
    eid = store.apply("add_evidence", evidence(pid), "alice")["id"]
    old = store.apply("save_report", {"project_id": pid}, "alice")
    store.apply("delete_evidence", {"project_id": pid, "evidence_id": eid}, "alice")
    new = store.apply("save_report", {"project_id": pid}, "alice")
    diff = store.apply("compare_reports", {"project_id": pid, "before": old["id"], "after": new["id"]}, "alice")
    assert diff["changes"][0]["kind"] == "removed"
    assert store.apply("get_report", {"project_id": pid, "report_id": old["id"]}, "alice")["snapshot"]["evidence"][0]["id"] == eid


@pytest.mark.asyncio
async def test_plugin_tools_use_host_identity_and_thread(tmp_path):
    registered = []
    install(SimpleNamespace(plugin=lambda p: registered.append(p) or True), {"enabled": True, "storage_path": str(tmp_path / "plugin.db")})
    plugin = registered[0]
    actions = {a.name: a.handler for a in plugin.backend}
    context = SimpleNamespace(principal=SimpleNamespace(user_id="alice"), thread_id="thread-1")
    pid = (await actions["create_project"]({"name": "产品", "brief": "调研", "competitors": ["产品 A"], "dimensions": ["定价"]}, context))["id"]
    tool = next(t for t in plugin.tools if t.name == "add_evidence")
    await tool.handler(evidence(pid), context)
    result = await actions["get_project"]({"project_id": pid}, context)
    assert result["evidence"][0]["thread_id"] == "thread-1"


@pytest.mark.asyncio
async def test_start_research_retries_same_admission(tmp_path):
    registered = []
    install(SimpleNamespace(plugin=lambda p: registered.append(p) or True), {"enabled": True, "storage_path": str(tmp_path / "plugin.db")})
    actions = {a.name: a.handler for a in registered[0].backend}
    calls = []

    class Runs:
        async def create_thread(self, **kwargs):
            return kwargs["thread_id"]

        async def start(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(thread_id=kwargs["thread_id"], run_id="run-1")

    context = SimpleNamespace(principal=SimpleNamespace(user_id="alice"), agent_runs=Runs())
    pid = (await actions["create_project"]({"name": "产品", "brief": "调研", "competitors": ["产品 A"], "dimensions": ["定价"]}, context))["id"]
    payload = {"project_id": pid, "operation_id": "retry-1"}
    first = await actions["start_research"](payload, context)
    second = await actions["start_research"](payload, context)
    assert first == second
    assert len(calls) == 1
    assert pid in calls[0]["input"]["messages"][0]["content"]


@pytest.mark.asyncio
async def test_real_toolnode_dispatch_and_identity(tmp_path):
    from langchain_core.messages import AIMessage
    from langgraph.graph import END, START, MessagesState, StateGraph
    from langgraph.prebuilt import ToolNode

    from deerflow.extensions.loader import ExtensionSpec, load_extensions
    from deerflow.extensions.plugin_tools import build_plugin_tools

    loaded, diagnostics = load_extensions([ExtensionSpec(use="deerflow_extension_research:install", config={"enabled": True, "storage_path": str(tmp_path / "real.db")}, required=True)])
    assert not diagnostics
    store = ResearchStore(tmp_path / "real.db")
    pid = project(store)
    tools = build_plugin_tools(loaded)
    save = next(t for t in tools if "_add_evidence_" in t.name)
    assert "user_id" not in save.tool_call_schema["properties"]
    graph = StateGraph(MessagesState)
    graph.add_node("tools", ToolNode(tools))
    graph.add_edge(START, "tools")
    graph.add_edge("tools", END)
    runtime = graph.compile()
    for owner in ("bob", "alice"):
        result = await runtime.ainvoke({"messages": [AIMessage(content="", tool_calls=[{"name": save.name, "args": evidence(pid), "id": "call-1"}])]}, context={"user_id": owner, "thread_id": "research-thread"})
        if owner == "bob":
            assert result["messages"][-1].status == "error"
        else:
            assert json.loads(result["messages"][-1].content)["thread_id"] == "research-thread"


@pytest.mark.asyncio
async def test_bounded_model_projection(tmp_path):
    registered = []
    install(SimpleNamespace(plugin=lambda p: registered.append(p) or True), {"storage_path": str(tmp_path / "large.db")})
    store = ResearchStore(tmp_path / "large.db")
    competitors = [str(i) + "竞" * 79 for i in range(6)]
    dimensions = [str(i) + "维" * 79 for i in range(8)]
    pid = store.apply("create_project", {"name": "名" * 120, "brief": "描" * 2000, "competitors": competitors, "dimensions": dimensions}, "alice")["id"]
    for c in competitors:
        for d in dimensions:
            for n in range(2):
                store.apply("add_evidence", evidence(pid, competitor=c, dimension=d, value=str(n) + "值" * 299, quote="据" * 1200), "alice")
    tool = next(t for t in registered[0].tools if t.name == "get_project")
    result = await tool.handler({"project_id": pid}, SimpleNamespace(principal=SimpleNamespace(user_id="alice")))
    assert len(json.dumps(result, ensure_ascii=False).encode()) < 64 * 1024


def test_reports_cannot_be_mixed_across_projects(store):
    first, second = project(store), project(store)
    foreign = store.apply("save_report", {"project_id": second}, "alice")
    with pytest.raises(ValueError, match="Report unavailable"):
        store.apply("get_report", {"project_id": first, "report_id": foreign["id"]}, "alice")
