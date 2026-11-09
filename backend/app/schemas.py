from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    issue: str = Field(min_length=1, max_length=5000)
    jurisdiction: str | None = Field(default=None, max_length=200)

    @field_validator("jurisdiction", mode="before")
    @classmethod
    def empty_jurisdiction_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value


class AnalysisResponse(BaseModel):
    success: bool
    demo: Literal[True] = True
    originalIssue: str | None = None
    jurisdiction: str | None = None
    category: str | None = None
    confidence: float | None = None
    identifiedIssue: str | None = None
    explanation: str = ""
    requiredDocuments: list[str] = Field(default_factory=list)
    nextSteps: list[str] = Field(default_factory=list)
    disclaimer: str = (
        "Automated category classification only; this is not legal advice or a verified "
        "legal assessment."
    )
    error: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"]
