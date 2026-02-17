"""CIX client service for market operations."""

import os
from typing import Any, Optional

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
    def _to_float(value: Any) -> float | None:
        """Convert arbitrary numeric input to float, preserving None."""
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _to_int(value: Any) -> int | None:
        """Convert arbitrary numeric input to int, preserving None."""
        if value is None:
            return None
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _same_price(price_a: float | None, price_b: float | None) -> bool:
        """Compare two prices with a tiny tolerance for float conversion noise."""
        if price_a is None or price_b is None:
            return False
        return abs(price_a - price_b) < 1e-9

    @staticmethod
    def _quote_or_none(
        price: float | None, size: int | None, is_mine: bool
    ) -> dict[str, Any] | None:
        """Build a quote payload only when price+size are both present."""
        if price is None or size is None:
            return None
        return {
            "price": price,
            "size": size,
            "is_mine": is_mine,
        }

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

        try:
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
        except Exception as exc:
            raise self._translate_client_error(exc, "get_orderbook") from exc

    def get_market_overview(self) -> dict:
        """Get top-of-book market data and ownership of best quotes for all teams."""
        if self._use_mock:
            return {
                "markets": [
                    {
                        "team": "Duke",
                        "bid": {"price": 2.50, "size": 10, "is_mine": False},
                        "ask": {"price": 2.60, "size": 15, "is_mine": True},
                    },
                    {
                        "team": "Kansas",
                        "bid": {"price": 2.20, "size": 8, "is_mine": True},
                        "ask": {"price": 2.35, "size": 12, "is_mine": False},
                    },
                ],
                "is_mock": True,
            }

        try:
            client = self._get_client()
            market_data_raw = client.market_data() or {}
            my_markets_raw = client.my_markets() or {}

            market_data = {
                client.from_cix_name(team): data
                for team, data in market_data_raw.items()
            }
            my_markets = {
                client.from_cix_name(team): data
                for team, data in my_markets_raw.items()
            }

            teams = sorted(set(market_data.keys()) | set(my_markets.keys()))
            markets: list[dict[str, Any]] = []

            for team in teams:
                top = market_data.get(team)
                mine = my_markets.get(team)

                top_map = top if isinstance(top, dict) else {}
                mine_map = mine if isinstance(mine, dict) else {}

                bid = self._to_float(top_map.get("bid"))
                ask = self._to_float(top_map.get("ask"))
                bid_size = self._to_int(top_map.get("bid_size"))
                ask_size = self._to_int(top_map.get("ask_size"))
                my_bid = self._to_float(mine_map.get("bid"))
                my_ask = self._to_float(mine_map.get("ask"))

                markets.append(
                    {
                        "team": team,
                        "bid": self._quote_or_none(
                            bid,
                            bid_size,
                            self._same_price(bid, my_bid),
                        ),
                        "ask": self._quote_or_none(
                            ask,
                            ask_size,
                            self._same_price(ask, my_ask),
                        ),
                    }
                )

            return {
                "markets": markets,
                "is_mock": False,
            }
        except Exception as exc:
            raise self._translate_client_error(exc, "get_market_overview") from exc

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
                    "Houston": {"bid": 3.10, "bid_size": 3000, "position": -50},
                    "Auburn": {"ask": 4.20, "ask_size": 2000, "position": 200},
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

        try:
            client = self._get_client()
            client.cancel_order(order_id)
            return {"success": True, "order_id": order_id, "is_mock": False}
        except Exception as exc:
            raise self._translate_client_error(exc, "cancel_order") from exc


def get_cix_service() -> CIXService:
    """Dependency injection for CIX service."""
    return CIXService.get_instance()
