from __future__ import annotations

from config.settings import Settings
from echoforge.errors import ConfigMissingError
from echoforge.providers.doubao import DoubaoProvider
from echoforge.providers.doubao_speech import DoubaoSpeechProvider
from echoforge.providers.tingwu import TingwuProvider


def build_understanding_provider(settings: Settings):
    provider_name = settings.understanding_provider.strip().lower()
    if provider_name == "tingwu":
        return TingwuProvider(settings)
    if provider_name == "doubao":
        return DoubaoProvider(settings)
    if provider_name == "doubao-speech":
        return DoubaoSpeechProvider(settings)
    raise ConfigMissingError(f"Unsupported understanding provider: {settings.understanding_provider}")
