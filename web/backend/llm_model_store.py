"""SQLite-backed storage for dashboard-selectable LLM models."""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from .models import LlmModel, LlmModelCreate, LlmModelType, StoredLlmModel


class LlmModelStore:
    """Persist and retrieve LLM model registry entries from SQLite."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS llm_models (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL,
                    model_name TEXT NOT NULL UNIQUE,
                    provider_url TEXT NOT NULL,
                    api_key TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            columns = {
                str(row[1])
                for row in conn.execute("PRAGMA table_info(llm_models)").fetchall()
            }
            if "api_key" not in columns:
                conn.execute("ALTER TABLE llm_models ADD COLUMN api_key TEXT")
            conn.commit()

    @staticmethod
    def _preview_api_key(api_key: Optional[str]) -> Optional[str]:
        if not api_key:
            return None
        key = api_key.strip()
        if len(key) <= 8:
            return "*" * len(key)
        return f"{key[:4]}...{key[-4:]}"

    def _public_model_from_row(self, row: sqlite3.Row) -> LlmModel:
        api_key = str(row["api_key"]).strip() if row["api_key"] else None
        return LlmModel(
            id=int(row["id"]),
            type=LlmModelType(str(row["type"]).lower()),
            model_name=str(row["model_name"]),
            provider_url=str(row["provider_url"]),
            has_api_key=bool(api_key),
            api_key_preview=self._preview_api_key(api_key),
            created_at=str(row["created_at"]),
        )

    def _stored_model_from_row(self, row: sqlite3.Row) -> StoredLlmModel:
        return StoredLlmModel(
            id=int(row["id"]),
            type=LlmModelType(str(row["type"]).lower()),
            model_name=str(row["model_name"]),
            provider_url=str(row["provider_url"]),
            api_key=str(row["api_key"]).strip() if row["api_key"] else None,
            created_at=str(row["created_at"]),
        )

    def list_models(self) -> List[LlmModel]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, type, model_name, provider_url, api_key, created_at
                FROM llm_models
                ORDER BY lower(type), lower(model_name)
                """
            ).fetchall()
        return [self._public_model_from_row(row) for row in rows]

    def create_model(self, payload: LlmModelCreate) -> LlmModel:
        created_at = datetime.now().isoformat()
        with self._connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO llm_models (type, model_name, provider_url, api_key, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    payload.type.value,
                    payload.model_name.strip(),
                    payload.provider_url.strip(),
                    payload.api_key.strip() if payload.api_key else None,
                    created_at,
                ),
            )
            conn.commit()
            lastrowid = cursor.lastrowid

        if lastrowid is None:
            raise RuntimeError("Failed to create LLM model record")
        model_id = int(lastrowid)

        model = self.get_model(model_id)
        if not model:
            raise RuntimeError("Failed to load created model")
        return model

    def get_model(self, model_id: int) -> Optional[LlmModel]:
        stored = self.get_stored_model(model_id)
        if not stored:
            return None
        return LlmModel(
            id=stored.id,
            type=stored.type,
            model_name=stored.model_name,
            provider_url=stored.provider_url,
            has_api_key=bool(stored.api_key),
            api_key_preview=self._preview_api_key(stored.api_key),
            created_at=stored.created_at,
        )

    def get_stored_model(self, model_id: int) -> Optional[StoredLlmModel]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, type, model_name, provider_url, api_key, created_at
                FROM llm_models
                WHERE id = ?
                """,
                (model_id,),
            ).fetchone()

        if not row:
            return None
        return self._stored_model_from_row(row)

    def delete_model(self, model_id: int) -> bool:
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM llm_models WHERE id = ?", (model_id,))
            conn.commit()
            return cursor.rowcount > 0
