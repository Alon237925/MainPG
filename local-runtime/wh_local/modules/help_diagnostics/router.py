from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException

from .schemas import DiagnosticsResponse, HelpStatusResponse, ManualChapter, ManualChapterSummary, ManualResponse
from .service import HelpDiagnosticsService


def create_router(database_path: Path) -> APIRouter:
    router = APIRouter(prefix="/desktop/help", tags=["help-diagnostics"])
    service = HelpDiagnosticsService(database_path)

    @router.get("/manual", response_model=ManualResponse)
    def get_manual() -> ManualResponse:
        return service.manual()

    @router.get("/manual/chapters", response_model=list[ManualChapterSummary])
    def list_manual_chapters() -> list[ManualChapterSummary]:
        return service.chapter_summaries()

    @router.get("/manual/chapters/{chapter_id}", response_model=ManualChapter)
    def get_manual_chapter(chapter_id: str) -> ManualChapter:
        chapter = service.chapter(chapter_id)
        if chapter is None:
            raise HTTPException(status_code=404, detail="manual chapter not found")
        return chapter

    @router.get("/status", response_model=HelpStatusResponse)
    def get_help_status() -> HelpStatusResponse:
        return service.status()

    @router.get("/diagnostics", response_model=DiagnosticsResponse)
    def get_diagnostics() -> DiagnosticsResponse:
        return service.diagnostics()

    return router
