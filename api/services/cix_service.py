"""CIX client service for market operations."""

import os
from typing import Optional


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
            apid = os.getenv("CIX_APID")
            if not apid:
                raise RuntimeError(
                    "CIX_APID environment variable is not set. "
                    "Set CIX_APID to connect to CIX, or set USE_MOCK_DATA=true for development."
                )
            self._client = cix_client.CixClient(apid)
        return self._client

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

        client = self._get_client()
        orderbook = client.get_orderbook(team)
        return {
            "team": team,
            "bids": orderbook.get("bids", []),
            "asks": orderbook.get("asks", []),
            "is_mock": False,
        }

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

    def cancel_order(self, order_id: str) -> dict:
        """Cancel an order."""
        if self._use_mock:
            return {"success": True, "order_id": order_id, "is_mock": True}

        client = self._get_client()
        client.cancel_order(order_id)
        return {"success": True, "order_id": order_id, "is_mock": False}


def get_cix_service() -> CIXService:
    """Dependency injection for CIX service."""
    return CIXService.get_instance()
