class EchoForgeError(Exception):
    """Base exception for EchoForge."""


class ConfigMissingError(EchoForgeError):
    """Raised when required configuration is missing."""


class RunNotFoundError(EchoForgeError):
    """Raised when a run cannot be found in state storage."""


class FeishuNotFoundError(EchoForgeError):
    """Raised when the Feishu minute token does not exist."""


class FeishuPermissionError(EchoForgeError):
    """Raised when the caller cannot access the Feishu minute."""


class TingwuUploadError(EchoForgeError):
    """Raised when media cannot be prepared for Tingwu."""


class TingwuTaskError(EchoForgeError):
    """Raised when a Tingwu task fails or times out."""


class ObsidianWriteError(EchoForgeError):
    """Raised when a rendered note cannot be written."""
