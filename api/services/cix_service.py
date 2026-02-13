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
            from api.services.tournament_service import get_tournament_service
            apid = os.getenv("CIX_APID")
            if not apid:
                raise RuntimeError(
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

    def get_orderbook(self, team: str) -> dict:
        """Get current orderbook for a team."""
        if self._use_mock:
            return {
                "team": team,
                "bids": [
                    {"price": 2.50, "size": 5000, "entry": "you"},
                    {"price": 2.45, "size": 2500, "entry": "shark42"},
                    {"price": 2.40, "size": 3000, "entry": "bettor_x"},
                    {"price": 2.35, "size": 1500, "entry": "market_mm"},
                    {"price": 2.30, "size": 4000, "entry": "whale99"},
                ],
                "asks": [
                    {"price": 2.60, "size": 3000, "entry": "shark42"},
                    {"price": 2.65, "size": 4000, "entry": "you"},
                    {"price": 2.70, "size": 2000, "entry": "bettor_x"},
                    {"price": 2.75, "size": 5000, "entry": "market_mm"},
                    {"price": 2.80, "size": 1000, "entry": "whale99"},
                ],
                "is_mock": True,
            }

        client = self._get_client()
        orderbook = client.get_orderbook(team)
        # CIX returns {price, quantity, entry} per level; map quantity→size
        bids = [
            {"price": b["price"], "size": b["quantity"], "entry": b.get("entry")}
            for b in orderbook.get("bids", [])
        ]
        asks = [
            {"price": a["price"], "size": a["quantity"], "entry": a.get("entry")}
            for a in orderbook.get("asks", [])
        ]
        return {
            "team": team,
            "bids": bids,
            "asks": asks,
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

    def make_market(self, team: str, bid: float, bid_size: int, ask: float, ask_size: int) -> dict:
        """Place or update a two-sided market (bid + ask) for a team."""
        if self._use_mock:
            return {
                "success": True,
                "team": team,
                "bid": bid,
                "bid_size": bid_size,
                "ask": ask,
                "ask_size": ask_size,
                "is_mock": True,
            }

        client = self._get_client()
        client.make_market(team, bid=bid, bid_size=bid_size, ask=ask, ask_size=ask_size)
        return {
            "success": True,
            "team": team,
            "bid": bid,
            "bid_size": bid_size,
            "ask": ask,
            "ask_size": ask_size,
            "is_mock": False,
        }

    def my_markets(self) -> dict:
        """Get user's current market-making orders for all teams."""
        if self._use_mock:
            return {
                "markets": {
                    "Duke": {"bid": 2.50, "bid_size": 5000, "ask": 2.65, "ask_size": 5000, "position": 100},
                    "Houston": {"bid": 3.10, "bid_size": 3000, "ask": 3.30, "ask_size": 3000, "position": -50},
                    "Auburn": {"bid": 4.00, "bid_size": 2000, "ask": 4.20, "ask_size": 2000, "position": 200},
                },
                "is_mock": True,
            }

        client = self._get_client()
        raw = client.my_markets()
        # CIX returns abbreviations as keys; translate to canonical names
        markets = {}
        for abbrev_or_name, data in raw.items():
            canonical = client.from_cix_name(abbrev_or_name)
            markets[canonical] = data
        return {
            "markets": markets,
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
