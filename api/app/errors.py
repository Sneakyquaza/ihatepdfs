"""API errors carry a stable `code` the frontend translates; `message` is an English fallback for logs/curl."""

from fastapi import HTTPException


class ApiError(HTTPException):
    def __init__(self, status: int, code: str, message: str = "", headers: dict | None = None, **params):
        detail = {"code": code, "message": message or code}
        if params:
            detail["params"] = params
        super().__init__(status, detail, headers)
