"""SQLite-backed storage for dashboard-selectable LLM models."""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from .models import LlmModel, LlmModelCreate, LlmModelType


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
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def list_models(self) -> List[LlmModel]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, type, model_name, provider_url, created_at
                FROM llm_models
                ORDER BY lower(type), lower(model_name)
                """
            ).fetchall()
        return [
            LlmModel(
                id=int(row["id"]),
                type=LlmModelType(str(row["type"]).lower()),
                model_name=str(row["model_name"]),
                provider_url=str(row["provider_url"]),
                created_at=str(row["created_at"]),
            )
            for row in rows
        ]

    def create_model(self, payload: LlmModelCreate) -> LlmModel:
        created_at = datetime.now().isoformat()
        with self._connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO llm_models (type, model_name, provider_url, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (payload.type.value, payload.model_name.strip(), payload.provider_url.strip(), created_at),
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
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, type, model_name, provider_url, created_at
                FROM llm_models
                WHERE id = ?
                """,
                (model_id,),
            ).fetchone()

        if not row:
            return None

        return LlmModel(
            id=int(row["id"]),
            type=LlmModelType(str(row["type"]).lower()),
            model_name=str(row["model_name"]),
            provider_url=str(row["provider_url"]),
            created_at=str(row["created_at"]),
        )

    def delete_model(self, model_id: int) -> bool:
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM llm_models WHERE id = ?", (model_id,))
            conn.commit()
            return cursor.rowcount > 0
