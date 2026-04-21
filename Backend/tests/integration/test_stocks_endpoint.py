import pytest

from app.routes import stocks as stocks_route


@pytest.mark.asyncio
async def test_stocks_endpoint_with_mocked_sources(client, monkeypatch):
    stocks_route.quotes_cache.clear()

    async def fake_tv_quotes():
        return {
            'COMI': {
                'currentPrice': 100.0,
                'high52w': 120.0,
                'low52w': 80.0,
                'belowHigh': -16.7,
                'fairValue': 114.0,
                'upside': 14.0,
                'marketCap': '1.00B',
                'peRatio': 8.0,
                'eps': 12.5,
                'sentiment': 65,
                'revenue': '100.00M',
                'logo': None,
            }
        }

    monkeypatch.setattr(stocks_route, 'fetch_tv_egx_quotes', fake_tv_quotes)
    monkeypatch.setattr(
        stocks_route,
        'EGX_STOCKS',
        [
            {
                'ticker': 'COMI.CA',
                'display': 'COMI',
                'name': 'Commercial International Bank',
                'sector': 'Banking',
                'industry': 'Banks',
            }
        ],
    )

    response = await client.get('/api/stocks')
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]['ticker'] == 'COMI'
    assert data[0]['currentPrice'] == 100.0
