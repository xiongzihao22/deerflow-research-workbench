"""Isolated loopback fixture: real plugin actions, assets and SQLite; test users."""

import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

import uvicorn
from deerflow_extension_api.auth import EXTENSION_PRINCIPAL_RESOLVER_KEY, ExtensionPrincipal
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from app.gateway.routers.plugins import router
from deerflow.extensions.loader import ExtensionSpec, load_extensions


def create_app(directory):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "examples/deerflow-extension-research-workbench"))
    extensions, diagnostics = load_extensions([ExtensionSpec(use="deerflow_extension_research:install", config={"enabled": True, "storage_path": str(Path(directory) / "research.sqlite")}, required=True)])
    assert not diagnostics
    app = FastAPI()
    app.state.extensions = extensions

    @app.middleware("http")
    async def identity(request, call_next):
        request.state.user = SimpleNamespace(id=request.headers.get("x-test-user", "alice"), system_role="user")
        request.state.auth_source = "session"
        return await call_next(request)

    setattr(app.state, EXTENSION_PRINCIPAL_RESOLVER_KEY, lambda request: ExtensionPrincipal(request.state.user.id))
    app.include_router(router)

    @app.get("/", response_class=HTMLResponse)
    async def page():
        return '<!doctype html><html lang="zh"><title>Research browser test</title><body style="margin:0"><div id="root"></div></body></html>'

    return app


if __name__ == "__main__":
    with TemporaryDirectory(prefix="deerflow-research-test-") as directory:
        uvicorn.run(create_app(directory), host="127.0.0.1", port=int(sys.argv[1]), log_level="warning")
