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
        """Get or create CIX client."""
        if self._client is None and not self._use_mock:
            apid = os.getenv("CIX_APID")
            if apid:
                try:
                    import cix_client
                    self._client = cix_client.CixClient(apid)
                except ImportError:
                    pass
        return self._client

    def is_available(self) -> bool:
        """Check if CIX client is available."""
        return self._get_client() is not None

    def get_orderbook(self, team: str) -> dict:
        """Get current orderbook for a team."""
        if self._use_mock:
            # Return mock orderbook
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
        if not client:
            return {"team": team, "bids": [], "asks": [], "is_mock": True}

        try:
            # Note: Actual CIX client API may differ
            orderbook = client.get_orderbook(team)
            return {
                "team": team,
                "bids": orderbook.get("bids", []),
                "asks": orderbook.get("asks", []),
                "is_mock": False,
            }
        except Exception as e:
            return {"team": team, "bids": [], "asks": [], "error": str(e), "is_mock": True}

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
        if not client:
            return {
                "success": False,
                "error": "CIX client not available",
                "is_mock": True,
            }

        try:
            if side == "buy":
                result = client.place_bid(team, price, size)
            elif side == "sell":
                result = client.place_ask(team, price, size)
            else:
                return {"success": False, "error": f"Invalid side: {side}"}

            return {
                "success": True,
                "order_id": result.get("order_id"),
                "team": team,
                "side": side,
                "price": price,
                "size": size,
                "is_mock": False,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def cancel_order(self, order_id: str) -> dict:
        """Cancel an order."""
        if self._use_mock:
            return {"success": True, "order_id": order_id, "is_mock": True}

        client = self._get_client()
        if not client:
            return {"success": False, "error": "CIX client not available"}

        try:
            client.cancel_order(order_id)
            return {"success": True, "order_id": order_id, "is_mock": False}
        except Exception as e:
            return {"success": False, "error": str(e)}


def get_cix_service() -> CIXService:
    """Dependency injection for CIX service."""
    return CIXService.get_instance()
