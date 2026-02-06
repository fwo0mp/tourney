"""Shared utilities for API routers."""

import json

from fastapi import HTTPException


def parse_what_if_params(
    what_if_outcomes: str | None,
    what_if_adjustments: str | None,
) -> tuple[list, dict]:
    """Parse what-if parameters from query strings.

    Raises HTTPException(400) if JSON is malformed.
    """
    outcomes = []
    adjustments = {}

    if what_if_outcomes:
        try:
            outcomes = json.loads(what_if_outcomes)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON in what_if_outcomes parameter")

    if what_if_adjustments:
        try:
            adjustments = json.loads(what_if_adjustments)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON in what_if_adjustments parameter")

    return outcomes, adjustments
