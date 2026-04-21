import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

# Ensure `from main import app` works regardless of the current working directory.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://testserver') as ac:
        yield ac
