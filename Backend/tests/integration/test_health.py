import pytest


@pytest.mark.asyncio
async def test_healthz(client):
    response = await client.get('/healthz')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


@pytest.mark.asyncio
async def test_root(client):
    response = await client.get('/')
    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'running'
    assert payload['exchange'] == 'EGX'
