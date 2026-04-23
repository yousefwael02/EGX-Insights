import logging
import os

import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: AsyncIOMotorClient | None = None
logger = logging.getLogger(__name__)


def _is_atlas_uri(uri: str) -> bool:
    return uri.startswith("mongodb+srv://") or "mongodb.net" in uri


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        client_options: dict[str, object] = {
            "serverSelectionTimeoutMS": int(
                os.getenv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", "30000")
            )
        }

        # Atlas/Cloud MongoDB commonly requires an explicit CA bundle in containers.
        if _is_atlas_uri(uri):
            client_options["tls"] = True
            client_options["tlsCAFile"] = certifi.where()

        _client = AsyncIOMotorClient(uri, **client_options)
        logger.info(
            "Mongo client initialized atlas=%s timeout_ms=%s",
            _is_atlas_uri(uri),
            client_options["serverSelectionTimeoutMS"],
        )
    return _client


def get_db() -> AsyncIOMotorDatabase:
    db_name = os.getenv("MONGODB_DB", "stockinsight")
    return get_client()[db_name]


async def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
