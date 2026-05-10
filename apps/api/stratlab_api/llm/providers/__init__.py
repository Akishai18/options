"""Provider factory + registry."""

from stratlab_api.config import Settings
from stratlab_api.llm.protocol import LLMProvider


def get_llm_provider(settings: Settings) -> LLMProvider:
    """Resolve the configured LLM provider. Raises if unconfigured."""
    name = (settings.llm_provider or "").lower()
    if name == "gemini":
        if not settings.gemini_api_key:
            raise RuntimeError(
                "STRATLAB_GEMINI_API_KEY not set; cannot use the gemini provider"
            )
        from stratlab_api.llm.providers.gemini import GeminiProvider
        return GeminiProvider(
            api_key=settings.gemini_api_key,
            model_parse=settings.llm_model_parse,
            model_critique=settings.llm_model_critique,
        )
    if name == "mock":
        from stratlab_api.llm.providers.mock import MockProvider
        return MockProvider()
    raise RuntimeError(f"unknown llm_provider: {name!r}")
