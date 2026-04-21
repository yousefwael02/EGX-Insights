from app.services.yahoo_finance import calc_sentiment, format_currency_value


def test_calc_sentiment_mapping():
    assert calc_sentiment('strong_buy') == 90
    assert calc_sentiment('hold') == 50
    assert calc_sentiment('unknown') == 50


def test_format_currency_value():
    assert format_currency_value(1_200_000_000) == '1.20B'
    assert format_currency_value(0) == 'N/A'
