from __future__ import annotations

import httpx

from config.settings import Settings
from echoforge.providers.doubao import DoubaoProvider


def test_doubao_provider_builds_payload_and_normalizes_results(tmp_path) -> None:
    recorded: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        recorded.append(request)
        if request.url.path.endswith("/submit"):
            return httpx.Response(
                200,
                headers={"X-Api-Status-Code": "20000000", "X-Api-Message": "OK"},
                json={"Data": {"TaskID": "task-456"}},
            )
        return httpx.Response(
            200,
            headers={"X-Api-Status-Code": "20000000", "X-Api-Message": "OK"},
            json={
                "Code": 0,
                "Message": "OK",
                "Data": {
                    "TaskID": "task-456",
                    "Status": "success",
                    "ErrCode": 0,
                    "ErrMessage": "",
                    "Result": {
                        "AudioTranscriptionFile": "https://example.com/transcription.json",
                        "ChapterFile": "https://example.com/chapters.json",
                        "SummarizationFile": "https://example.com/summarization.json",
                        "InformationExtractionFile": "https://example.com/meeting_assistance.json",
                    },
                },
            },
        )

    settings = Settings(
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
        doubao_app_key="doubao-app",
        doubao_access_key="doubao-access",
    )
    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = DoubaoProvider(settings, client=client)

    task_id = provider.create_task("https://example.com/audio.ogg", title="周会")
    task_info = provider.get_task_info(task_id)

    submit_payload = recorded[0].read().decode("utf-8")
    assert task_id == "task-456"
    assert '"FileURL":"https://example.com/audio.ogg"' in submit_payload
    assert '"FileType":"audio"' in submit_payload
    assert task_info.status == "completed"
    assert task_info.result_urls["audiotranscriptionfile"] == "https://example.com/transcription.json"
    assert task_info.result_urls["chapterfile"] == "https://example.com/chapters.json"


def test_doubao_download_results_maps_output_names(tmp_path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"{}")

    settings = Settings(
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
        doubao_app_key="doubao-app",
        doubao_access_key="doubao-access",
    )
    provider = DoubaoProvider(settings, client=httpx.Client(transport=httpx.MockTransport(handler)))

    downloaded = provider.download_results(
        {
            "audiotranscriptionfile": "https://example.com/transcription.json",
            "chapterfile": "https://example.com/chapters.json",
            "summarizationfile": "https://example.com/summarization.json",
            "informationextractionfile": "https://example.com/meeting_assistance.json",
        },
        tmp_path / "results",
    )

    assert set(downloaded) == {"transcription", "chapters", "summarization", "meeting_assistance"}
