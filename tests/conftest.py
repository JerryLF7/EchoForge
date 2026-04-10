from __future__ import annotations

from pathlib import Path

import pytest

from config.settings import Settings


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        outputs_dir=tmp_path / "outputs",
        obsidian_vault_path=tmp_path / "vault",
        feishu_minutes_sync_bin="/bin/true",
        feishu_minutes_sync_exports_dir=tmp_path / "exports",
        tingwu_access_key_id="test-ak",
        tingwu_access_key_secret="test-sk",
        tingwu_app_key="test-app",
        r2_account_id="test-r2-account",
        r2_access_key_id="test-r2-ak",
        r2_secret_access_key="test-r2-sk",
        r2_bucket_name="test-bucket",
    )
