from app.services import gemini


def test_generate_insight_sync_without_key_returns_fallback(monkeypatch):
    monkeypatch.setattr(gemini, '_genai_available', False)

    text = gemini._generate_insight_sync(
        'COMI',
        {'name': 'Commercial International Bank', 'sector': 'Banking'},
    )

    assert 'GEMINI_API_KEY' in text
    assert 'Commercial International Bank' in text
