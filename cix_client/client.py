import os
from collections import namedtuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from cix_client.exceptions import ApiException, BracketMismatchError
from team_names import resolve_name

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
        self._timeout_seconds = float(os.getenv("CIX_TIMEOUT_SECONDS", "5.0"))
        retries = Retry(
            total=3,
            connect=3,
            read=3,
            backoff_factor=0.25,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=frozenset(["POST"]),
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retries)
        self._session.mount("http://", adapter)
        self._session.mount("https://", adapter)
        self._bracket_teams = None
        self._bracket_validated = False
        self._validation_error = None
        self._to_cix = {}    # canonical/bracket name → CIX server name
        self._from_cix = {}  # CIX server name → canonical/bracket name

    def set_bracket_teams(self, teams):
        """Set bracket team names for validation against CIX game config.

        When set, the first API call will fetch game_config and verify all
        bracket team names exist in the server's team list. If validation
        fails, all subsequent API calls will be blocked.
        """
        self._bracket_teams = list(teams)
        self._bracket_validated = False
        self._validation_error = None
        self._to_cix = {}
        self._from_cix = {}

    def game_config(self):
        """Fetch game configuration from the CIX server.

        Returns:
            dict with game_name, game_type, scoring, teams, etc.
        """
        return self._post("game_config", _skip_validation=True)

    def _validate_bracket(self):
        """Validate bracket teams against CIX game config.

        Called automatically on first API request when bracket_teams is set.
        Builds bidirectional name mappings (canonical↔CIX) using equivalence
        classes from team_names.
        """
        if self._bracket_validated:
            return
        if self._bracket_teams is None:
            self._bracket_validated = True
            return

        config = self.game_config()
        # game_config returns teams as {abbrev: full_name}
        teams_map = config["teams"]
        server_team_names = set(teams_map.values())
        full_to_abbrev = {full: abbrev for abbrev, full in teams_map.items()}

        missing = []
        for team in self._bracket_teams:
            try:
                cix_full = resolve_name(team, server_team_names)
                abbrev = full_to_abbrev[cix_full]
                self._to_cix[team] = abbrev
                self._from_cix[cix_full] = team
                self._from_cix[abbrev] = team
            except KeyError:
                missing.append(team)

        if missing:
            msg = (
                "Bracket team names do not match CIX game config!\n"
                f"The following {len(missing)} team(s) from the bracket "
                "are not in the CIX server's team list:\n"
            )
            for team in sorted(missing):
                msg += f"  - {team!r}\n"
            msg += "\nCIX server teams:\n"
            for name in sorted(server_team_names):
                msg += f"  - {name!r}\n"
            msg += (
                "\nAll CIX API calls are blocked until the bracket "
                "configuration is fixed."
            )
            self._validation_error = msg
            raise BracketMismatchError(msg)

        self._bracket_validated = True

    def to_cix_name(self, name):
        """Translate a canonical/bracket name to the CIX abbreviation (symbol)."""
        return self._to_cix.get(name, name)

    def from_cix_name(self, name):
        """Translate a CIX name (abbreviation or full) to the canonical/bracket name."""
        return self._from_cix.get(name, name)

    def _post(self, endpoint, **params):
        """Make a POST request to the legacy API.

        Args:
            endpoint: API endpoint name (e.g., "positions").
            **params: Additional POST parameters beyond apid.

        Returns:
            The 'result' field from the response, or None if absent.

        Raises:
            ApiException: If the API returns success=False.
            BracketMismatchError: If bracket validation failed.
            requests.RequestException: On network/HTTP errors.
        """
        skip_validation = params.pop("_skip_validation", False)

        if not skip_validation:
            if self._validation_error:
                raise BracketMismatchError(self._validation_error)
            if not self._bracket_validated:
                self._validate_bracket()

        url = f"{self.base_url}/ncaa/api/{endpoint}"
        data = {"apid": self.apid, **params}
        response = self._session.post(
            url,
            data=data,
            timeout=self._timeout_seconds,
        )
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
            with the cash/points balance.  When full_names=True, CIX names
            are translated back to canonical/bracket names.
        """
        name_type = "full" if full_names else "abbrev"
        positions = self._post("positions", name=name_type)
        if full_names and self._from_cix:
            return {self.from_cix_name(k): v for k, v in positions.items()}
        return positions

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
            team=str(self.to_cix_name(team)),
            bid=str(bid),
            bid_size=str(bid_size),
            ask=str(ask),
            ask_size=str(ask_size),
        )

    # --- Order Book ---

    def get_orderbook(self, team, depth=5):
        """Get order book for a team.

        Tries the get_book endpoint first (full depth). If it fails,
        falls back to market_data which provides top-of-book only.

        Args:
            team: Team name/identifier.
            depth: Number of price levels (default 5).

        Returns:
            dict with 'bids' and 'asks' lists. Each entry has
            'price', 'quantity', 'entry' keys.
        """
        abbrev = str(self.to_cix_name(team))
        try:
            result = self._post("get_book", team=abbrev, depth=str(depth))
            if result:
                result["bids"] = list(result.get("bids", []))
                result["asks"] = list(result.get("asks", []))
            return result
        except Exception:
            # get_book may fail (server-side serialization bug);
            # fall back to market_data for top-of-book
            all_data = self._post("market_data")
            team_data = all_data.get(abbrev, {})
            bids = []
            asks = []
            if team_data.get("bid") is not None:
                bids = [{"price": team_data["bid"], "quantity": team_data.get("bid_size", 0)}]
            if team_data.get("ask") is not None:
                asks = [{"price": team_data["ask"], "quantity": team_data.get("ask_size", 0)}]
            return {"bids": bids, "asks": asks}

    # --- Order Placement ---

    def place_bid(self, team, price, size):
        """Place a buy order.

        Returns:
            dict with 'order_id' key.
        """
        return self._post(
            "place_order",
            team_identifier=str(self.to_cix_name(team)),
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
            team_identifier=str(self.to_cix_name(team)),
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
