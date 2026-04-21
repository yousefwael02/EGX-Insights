import os

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        _client = AsyncIOMotorClient(uri)
    return _client


def get_db() -> AsyncIOMotorDatabase:
    db_name = os.getenv("MONGODB_DB", "stockinsight")
    return get_client()[db_name]


async def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
