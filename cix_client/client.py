import os
from collections import namedtuple

import requests

from cix_client.exceptions import ApiException

Portfolio = namedtuple("Portfolio", ["cash"])


class CixClient:
    """Client for the CIX legacy API (/ncaa/api/).

    All endpoints are POST, CSRF-exempt, and authenticated via `apid` in the
    request body.
    """

    def __init__(self, apid, base_url=None):
        self.apid = apid
        self.base_url = (
            base_url or os.getenv("CIX_BASE_URL", "http://localhost:8000")
        ).rstrip("/")
        self._session = requests.Session()

    def _post(self, endpoint, **params):
        """Make a POST request to the legacy API.

        Args:
            endpoint: API endpoint name (e.g., "positions").
            **params: Additional POST parameters beyond apid.

        Returns:
            The 'result' field from the response, or None if absent.

        Raises:
            ApiException: If the API returns success=False.
            requests.RequestException: On network/HTTP errors.
        """
        url = f"{self.base_url}/ncaa/api/{endpoint}"
        data = {"apid": self.apid, **params}
        response = self._session.post(url, data=data)
        response.raise_for_status()
        body = response.json()

        if not body.get("success", False):
            raise ApiException(body.get("errors", ["Unknown API error"]))

        return body.get("result")

    # --- Positions & Portfolio ---

    def my_positions(self, full_names=False):
        """Get current positions.

        Args:
            full_names: If True, use full team names; otherwise abbreviations.

        Returns:
            dict mapping team names to share counts, plus a "points" key
            with the cash/points balance.
        """
        name_type = "full" if full_names else "abbrev"
        return self._post("positions", name=name_type)

    def my_portfolio(self):
        """Get portfolio summary with cash balance.

        Returns:
            Portfolio namedtuple with a .cash attribute.
        """
        positions = self._post("positions", name="abbrev")
        cash = positions.get("points", 0.0)
        return Portfolio(cash=cash)

    # --- Market Making ---

    def make_market(self, team, bid, bid_size, ask, ask_size):
        """Place or update a two-sided market (bid + ask).

        Args:
            team: Team name/identifier.
            bid: Bid price.
            bid_size: Bid quantity.
            ask: Ask price.
            ask_size: Ask quantity.
        """
        self._post(
            "make_market",
            team=str(team),
            bid=str(bid),
            bid_size=str(bid_size),
            ask=str(ask),
            ask_size=str(ask_size),
        )

    # --- Order Book ---

    def get_orderbook(self, team, depth=5):
        """Get order book for a team.

        Args:
            team: Team name/identifier.
            depth: Number of price levels (default 5).

        Returns:
            dict with 'bids' and 'asks' lists. Each entry has
            'price', 'quantity', 'entry' keys.
        """
        result = self._post("get_book", team=str(team), depth=str(depth))
        if result:
            result["bids"] = list(result.get("bids", []))
            result["asks"] = list(result.get("asks", []))
        return result

    # --- Order Placement ---

    def place_bid(self, team, price, size):
        """Place a buy order.

        Returns:
            dict with 'order_id' key.
        """
        return self._post(
            "place_order",
            team_identifier=str(team),
            side="buy",
            price=str(price),
            quantity=str(size),
        )

    def place_ask(self, team, price, size):
        """Place a sell order.

        Returns:
            dict with 'order_id' key.
        """
        return self._post(
            "place_order",
            team_identifier=str(team),
            side="sell",
            price=str(price),
            quantity=str(size),
        )

    def cancel_order(self, order_id):
        """Cancel an existing order."""
        self._post("cancel_order", order_id=str(order_id))

    # --- Market Data ---

    def market_data(self):
        """Get top-of-book market data for all teams.

        Returns:
            dict mapping team abbreviations to
            {bid, bid_size, ask, ask_size}.
        """
        return self._post("market_data")

    def my_markets(self):
        """Get user's current market-making positions and orders.

        Returns:
            dict mapping team abbreviations to
            {position, bid?, bid_size?, ask?, ask_size?}.
        """
        return self._post("my_markets")

    # --- Trade History ---

    def executions(self, mine_only=False, since=None, n=None):
        """Get execution history.

        Args:
            mine_only: If True, only return user's own executions.
            since: Datetime string (YYYY-MM-DD HH:MM:SS) to filter from.
            n: Maximum number of executions to return.

        Returns:
            list of dicts with time, team, side, quantity, price.
        """
        params = {}
        if mine_only:
            params["mine_only"] = "true"
        if since:
            params["since"] = str(since)
        if n is not None:
            params["n"] = str(n)
        return self._post("executions", **params)

    def open_orders(self):
        """Get user's open orders.

        Returns:
            list of dicts with id, team, side, quantity, price,
            cancel_on_game.
        """
        return self._post("open_orders")
