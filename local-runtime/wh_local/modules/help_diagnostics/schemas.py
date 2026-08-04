from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


ManualStatus = Literal["available", "implemented", "in_progress", "planned"]
Audience = Literal["admin", "operator", "all"]


class ManualStep(BaseModel):
    title: str
    body: str


class ManualSection(BaseModel):
    heading: str
    body: str = ""
    items: list[str] = Field(default_factory=list)
    steps: list[ManualStep] = Field(default_factory=list)


class ManualChapter(BaseModel):
    id: str
    order: int
    title: str
    summary: str
    audience: list[Audience] = Field(default_factory=lambda: ["all"])
    status: ManualStatus = "planned"
    sections: list[ManualSection] = Field(default_factory=list)
    related_endpoints: list[str] = Field(default_factory=list)


class ManualChapterSummary(BaseModel):
    id: str
    order: int
    title: str
    summary: str
    audience: list[Audience]
    status: ManualStatus
    related_endpoints: list[str] = Field(default_factory=list)


class ManualResponse(BaseModel):
    ok: bool = True
    title: str
    version: str
    chapters: list[ManualChapter]


class ModuleStatus(BaseModel):
    id: str
    name: str
    status: ManualStatus
    mounted: bool
    description: str
    endpoints: list[str] = Field(default_factory=list)


class DiagnosticCheck(BaseModel):
    id: str
    label: str
    status: Literal["ok", "warn", "error"]
    message: str


class HelpStatusResponse(BaseModel):
    ok: bool = True
    modules: list[ModuleStatus]


class DiagnosticsResponse(BaseModel):
    ok: bool = True
    runtime: dict[str, str]
    modules: list[ModuleStatus]
    checks: list[DiagnosticCheck]
