from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables and .env files."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    understanding_provider: str = Field(
        default="tingwu",
        validation_alias=AliasChoices("ECHOFORGE_UNDERSTANDING_PROVIDER"),
    )

    tingwu_access_key_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TINGWU_ACCESS_KEY_ID"),
    )
    tingwu_access_key_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TINGWU_ACCESS_KEY_SECRET"),
    )
    tingwu_security_token: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TINGWU_SECURITY_TOKEN"),
    )
    tingwu_app_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TINGWU_APP_KEY"),
    )
    tingwu_region: str = Field(
        default="cn-beijing",
        validation_alias=AliasChoices("TINGWU_REGION"),
    )
    tingwu_endpoint: str = Field(
        default="https://tingwu.cn-beijing.aliyuncs.com",
        validation_alias=AliasChoices("TINGWU_ENDPOINT"),
    )
    tingwu_language: str = Field(
        default="auto",
        validation_alias=AliasChoices("TINGWU_LANGUAGE"),
    )
    tingwu_model: str = Field(
        default="tingwu",
        validation_alias=AliasChoices("TINGWU_MODEL"),
    )

    doubao_app_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DOUBAO_APP_KEY"),
    )
    doubao_access_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DOUBAO_ACCESS_KEY"),
    )
    doubao_resource_id: str = Field(
        default="volc.lark.minutes",
        validation_alias=AliasChoices("DOUBAO_RESOURCE_ID"),
    )
    doubao_submit_url: str = Field(
        default="https://openspeech.bytedance.com/api/v3/auc/lark/submit",
        validation_alias=AliasChoices("DOUBAO_SUBMIT_URL"),
    )
    doubao_query_url: str = Field(
        default="https://openspeech.bytedance.com/api/v3/auc/lark/query",
        validation_alias=AliasChoices("DOUBAO_QUERY_URL"),
    )
    doubao_source_lang: str = Field(
        default="zh_cn",
        validation_alias=AliasChoices("DOUBAO_SOURCE_LANG"),
    )
    doubao_speaker_identification: bool = Field(
        default=True,
        validation_alias=AliasChoices("DOUBAO_SPEAKER_IDENTIFICATION"),
    )
    doubao_number_of_speakers: int = Field(
        default=0,
        validation_alias=AliasChoices("DOUBAO_NUMBER_OF_SPEAKERS"),
    )
    doubao_need_word_time_series: bool = Field(
        default=True,
        validation_alias=AliasChoices("DOUBAO_NEED_WORD_TIME_SERIES"),
    )

    r2_account_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("R2_ACCOUNT_ID"),
    )
    r2_access_key_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("R2_ACCESS_KEY_ID"),
    )
    r2_secret_access_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("R2_SECRET_ACCESS_KEY"),
    )
    r2_bucket_name: str | None = Field(
        default=None,
        validation_alias=AliasChoices("R2_BUCKET_NAME"),
    )
    r2_presigned_expiry: int = Field(
        default=10800,
        validation_alias=AliasChoices("R2_PRESIGNED_EXPIRY"),
    )

    outputs_dir: Path = Field(
        default=Path("outputs"),
        validation_alias=AliasChoices("ECHOFORGE_OUTPUTS_DIR", "ECHFORGE_OUTPUTS_DIR"),
    )
    obsidian_vault_path: Path | None = Field(
        default=None,
        validation_alias=AliasChoices("OBSIDIAN_VAULT_PATH"),
    )
    feishu_minutes_sync_bin: str = Field(
        default="feishu-minutes-sync",
        validation_alias=AliasChoices("FEISHU_MINUTES_SYNC_BIN"),
    )
    feishu_minutes_sync_exports_dir: Path = Field(
        default=Path("exports"),
        validation_alias=AliasChoices("FEISHU_MINUTES_SYNC_EXPORTS_DIR"),
    )

    default_template: str = Field(
        default="full",
        validation_alias=AliasChoices("ECHOFORGE_DEFAULT_TEMPLATE", "ECHFORGE_DEFAULT_TEMPLATE"),
    )
    poll_interval_seconds: int = Field(
        default=5,
        validation_alias=AliasChoices("ECHOFORGE_POLL_INTERVAL_SECONDS", "ECHOFORGE_POLL_INTERVAL_SECONDS"),
    )
    poll_slow_interval_seconds: int = Field(
        default=15,
        validation_alias=AliasChoices("ECHOFORGE_POLL_SLOW_INTERVAL_SECONDS", "ECHOFORGE_POLL_SLOW_INTERVAL_SECONDS"),
    )
    poll_timeout_seconds: int = Field(
        default=600,
        validation_alias=AliasChoices("ECHOFORGE_POLL_TIMEOUT_SECONDS", "ECHOFORGE_POLL_TIMEOUT_SECONDS"),
    )
    log_level: str = Field(
        default="INFO",
        validation_alias=AliasChoices("ECHOFORGE_LOG_LEVEL"),
    )

    def resolved_outputs_dir(self) -> Path:
        return self.outputs_dir.expanduser().resolve()

    def resolved_obsidian_vault_path(self) -> Path | None:
        if self.obsidian_vault_path is None:
            return None
        return self.obsidian_vault_path.expanduser().resolve()

    def resolved_feishu_exports_dir(self) -> Path:
        return self.feishu_minutes_sync_exports_dir.expanduser().resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
