"""CIX client service for market operations."""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

from cix_client.exceptions import ApiException, BracketMismatchError


class CIXServiceError(RuntimeError):
    """Base class for CIX service failures."""


class CIXConfigurationError(CIXServiceError):
    """Raised when CIX service is misconfigured."""


class CIXUnavailableError(CIXServiceError):
    """Raised when CIX cannot be reached."""


class CIXUpstreamError(CIXServiceError):
    """Raised when CIX returns an application error."""


class CIXService:
    """Service for CIX market operations."""

    _instance: Optional["CIXService"] = None

    def __init__(self):
        self._client = None
        self._use_mock = os.getenv("USE_MOCK_DATA", "").lower() in ("true", "1", "yes")

    @classmethod
    def get_instance(cls) -> "CIXService":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = CIXService()
        return cls._instance

    def _get_client(self):
        """Get or create CIX client.

        Raises RuntimeError if CIX_APID is not configured (and not in mock mode).
        """
        if self._client is None and not self._use_mock:
            import cix_client
            from api.services.tournament_service import get_tournament_service
            apid = os.getenv("CIX_APID")
            if not apid:
                raise CIXConfigurationError(
                    "CIX_APID environment variable is not set. "
                    "Set CIX_APID to connect to CIX, or set USE_MOCK_DATA=true for development."
                )
            client = cix_client.CixClient(apid)
            tournament = get_tournament_service()
            if tournament.state is not None:
                bracket_teams = tournament.state.get_bracket_teams()
                client.set_bracket_teams(bracket_teams)
            self._client = client
        return self._client

    @staticmethod
    def _translate_client_error(exc: Exception, operation: str) -> CIXServiceError:
        """Map lower-level client/network failures to typed service errors."""
        if isinstance(exc, (ApiException, BracketMismatchError)):
            return CIXUpstreamError(f"CIX {operation} failed: {exc}")
        if isinstance(exc, requests.RequestException):
            return CIXUnavailableError(f"CIX {operation} request failed: {exc}")
        if isinstance(exc, CIXServiceError):
            return exc
        return CIXUpstreamError(f"CIX {operation} failed: {exc}")

    @staticmethod
    def _to_float(value: object, default: float = 0.0) -> float:
        """Best-effort numeric coercion."""
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _parse_timestamp(value: str) -> datetime | None:
        """Parse common timestamp formats returned by CIX."""
        if not value:
            return None

        normalized = value.strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed
        except ValueError:
            pass

        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
            try:
                return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        return None

    def get_orderbook(self, team: str) -> dict:
        """Get current orderbook for a team."""
        if self._use_mock:
            return {
                "team": team,
                "bids": [
                    {"price": 2.50, "size": 10},
                    {"price": 2.45, "size": 25},
                ],
                "asks": [
                    {"price": 2.60, "size": 15},
                    {"price": 2.65, "size": 20},
                ],
                "is_mock": True,
            }

        try:
            client = self._get_client()
            orderbook = client.get_orderbook(team)
            return {
                "team": team,
                "bids": orderbook.get("bids", []),
                "asks": orderbook.get("asks", []),
                "is_mock": False,
            }
        except Exception as exc:
            raise self._translate_client_error(exc, "get_orderbook") from exc

    def place_order(self, team: str, side: str, price: float, size: int) -> dict:
        """Place an order."""
        if self._use_mock:
            return {
                "success": True,
                "order_id": "mock_order_123",
                "team": team,
                "side": side,
                "price": price,
                "size": size,
                "is_mock": True,
            }

        try:
            client = self._get_client()
            if side == "buy":
                result = client.place_bid(team, price, size)
            elif side == "sell":
                result = client.place_ask(team, price, size)
            else:
                raise ValueError(f"Invalid side: {side}")

            return {
                "success": True,
                "order_id": result.get("order_id"),
                "team": team,
                "side": side,
                "price": price,
                "size": size,
                "is_mock": False,
            }
        except ValueError:
            raise
        except Exception as exc:
            raise self._translate_client_error(exc, "place_order") from exc

    def cancel_order(self, order_id: str) -> dict:
        """Cancel an order."""
        if self._use_mock:
            return {"success": True, "order_id": order_id, "is_mock": True}

        try:
            client = self._get_client()
            client.cancel_order(order_id)
            return {"success": True, "order_id": order_id, "is_mock": False}
        except Exception as exc:
            raise self._translate_client_error(exc, "cancel_order") from exc

    def get_executions(
        self,
        mine_only: bool = True,
        since: str | None = None,
        n: int | None = 200,
    ) -> dict:
        """Get recent trade executions."""
        if self._use_mock:
            now = datetime.now(timezone.utc)
            mock_executions = [
                {
                    "time": (now - timedelta(minutes=12)).isoformat(timespec="seconds"),
                    "team": "Duke",
                    "side": "buy",
                    "quantity": 8.0,
                    "price": 2.45,
                },
                {
                    "time": (now - timedelta(minutes=38)).isoformat(timespec="seconds"),
                    "team": "Houston",
                    "side": "sell",
                    "quantity": 5.0,
                    "price": 2.2,
                },
                {
                    "time": (now - timedelta(hours=1, minutes=5)).isoformat(timespec="seconds"),
                    "team": "Auburn",
                    "side": "buy",
                    "quantity": 4.0,
                    "price": 1.95,
                },
                {
                    "time": (now - timedelta(hours=2, minutes=47)).isoformat(timespec="seconds"),
                    "team": "Connecticut",
                    "side": "sell",
                    "quantity": 6.0,
                    "price": 2.85,
                },
                {
                    "time": (now - timedelta(hours=6, minutes=15)).isoformat(timespec="seconds"),
                    "team": "Tennessee",
                    "side": "buy",
                    "quantity": 3.0,
                    "price": 1.7,
                },
                {
                    "time": (now - timedelta(hours=10, minutes=22)).isoformat(timespec="seconds"),
                    "team": "Kansas",
                    "side": "buy",
                    "quantity": 2.0,
                    "price": 1.5,
                },
                {
                    "time": (now - timedelta(hours=20, minutes=11)).isoformat(timespec="seconds"),
                    "team": "Alabama",
                    "side": "sell",
                    "quantity": 7.0,
                    "price": 1.9,
                },
                {
                    "time": (now - timedelta(hours=30, minutes=42)).isoformat(timespec="seconds"),
                    "team": "Marquette",
                    "side": "buy",
                    "quantity": 5.0,
                    "price": 1.8,
                },
            ]

            if since:
                cutoff = self._parse_timestamp(since)
                if cutoff is not None:
                    mock_executions = [
                        e
                        for e in mock_executions
                        if (self._parse_timestamp(e["time"]) or datetime.min.replace(tzinfo=timezone.utc))
                        >= cutoff
                    ]

            if n is not None:
                mock_executions = mock_executions[:n]

            return {"executions": mock_executions, "is_mock": True}

        try:
            client = self._get_client()
            raw_executions = client.executions(
                mine_only=mine_only,
                since=since,
                n=n,
            ) or []

            normalized = []
            for execution in raw_executions:
                if not isinstance(execution, dict):
                    continue

                raw_team = str(
                    execution.get("team")
                    or execution.get("team_identifier")
                    or execution.get("ticker")
                    or ""
                )
                team = client.from_cix_name(raw_team) if raw_team else ""
                time_value = (
                    execution.get("time")
                    or execution.get("timestamp")
                    or execution.get("created_at")
                    or ""
                )
                quantity = self._to_float(
                    execution.get("quantity", execution.get("qty", execution.get("size")))
                )
                price = self._to_float(execution.get("price"))

                normalized.append(
                    {
                        "time": str(time_value),
                        "team": team,
                        "side": str(execution.get("side") or ""),
                        "quantity": quantity,
                        "price": price,
                    }
                )

            return {"executions": normalized, "is_mock": False}
        except Exception as exc:
            raise self._translate_client_error(exc, "get_executions") from exc


def get_cix_service() -> CIXService:
    """Dependency injection for CIX service."""
    return CIXService.get_instance()
