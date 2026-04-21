from cachetools import TTLCache

# 5-minute TTL cache for stock quotes
quotes_cache: TTLCache = TTLCache(maxsize=200, ttl=300)

# 1-hour TTL cache for historical price data
history_cache: TTLCache = TTLCache(maxsize=500, ttl=3600)

# 24-hour TTL cache for AI-generated insights
insights_cache: TTLCache = TTLCache(maxsize=200, ttl=86400)

# 5-minute TTL cache for market index summary
market_cache: TTLCache = TTLCache(maxsize=10, ttl=300)

# 1-hour TTL cache for AI market recommendations
recommendations_cache: TTLCache = TTLCache(maxsize=10, ttl=3600)
