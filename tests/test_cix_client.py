"""Tests for the cix_client module."""

import pytest
from unittest.mock import patch, MagicMock
from decimal import Decimal

import cix_client
from cix_client import CixClient, ApiException, BracketMismatchError
from cix_client.client import Portfolio


class TestApiException:
    def test_single_error_string(self):
        ex = ApiException("something went wrong")
        assert ex.errors == ["something went wrong"]
        assert str(ex) == "something went wrong"

    def test_error_list(self):
        ex = ApiException(["error 1", "error 2"])
        assert ex.errors == ["error 1", "error 2"]
        assert str(ex) == "error 1, error 2"

    def test_is_exception(self):
        assert isinstance(ApiException("test"), Exception)

    def test_accessible_from_module(self):
        assert cix_client.ApiException is ApiException


class TestCixClientConstruction:
    def test_default_base_url(self):
        with patch.dict("os.environ", {}, clear=True):
            client = CixClient("test-apid")
        assert client.base_url == "http://localhost:8000"
        assert client.apid == "test-apid"

    def test_custom_base_url(self):
        client = CixClient("test-apid", base_url="http://example.com:9000")
        assert client.base_url == "http://example.com:9000"

    def test_base_url_strips_trailing_slash(self):
        client = CixClient("test-apid", base_url="http://example.com/")
        assert client.base_url == "http://example.com"

    @patch.dict("os.environ", {"CIX_BASE_URL": "http://env-url:8080"})
    def test_env_base_url(self):
        client = CixClient("test-apid")
        assert client.base_url == "http://env-url:8080"

    def test_explicit_base_url_overrides_env(self):
        with patch.dict("os.environ", {"CIX_BASE_URL": "http://env-url:8080"}):
            client = CixClient("test-apid", base_url="http://explicit:9000")
        assert client.base_url == "http://explicit:9000"


class TestPost:
    def _make_client(self):
        return CixClient("test-apid", base_url="http://test:8000")

    def test_success_response(self):
        client = self._make_client()
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "success": True, "errors": [], "result": {"Duke": 10}
        }
        with patch.object(client._session, "post", return_value=mock_response):
            result = client._post("positions")
        assert result == {"Duke": 10}

    def test_success_no_result(self):
        client = self._make_client()
        mock_response = MagicMock()
        mock_response.json.return_value = {"success": True, "errors": []}
        with patch.object(client._session, "post", return_value=mock_response):
            result = client._post("cancel_order", order_id="abc")
        assert result is None

    def test_error_response_raises(self):
        client = self._make_client()
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "success": False, "errors": ["invalid apid"]
        }
        with patch.object(client._session, "post", return_value=mock_response):
            with pytest.raises(ApiException) as exc_info:
                client._post("positions")
            assert exc_info.value.errors == ["invalid apid"]

    def test_apid_included_in_post_data(self):
        client = self._make_client()
        mock_response = MagicMock()
        mock_response.json.return_value = {"success": True, "errors": []}
        with patch.object(client._session, "post", return_value=mock_response) as mock_post:
            client._post("positions", name="full")
        mock_post.assert_called_once_with(
            "http://test:8000/ncaa/api/positions",
            data={"apid": "test-apid", "name": "full"},
        )

    def test_http_error_raises(self):
        client = self._make_client()
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = Exception("500 Server Error")
        with patch.object(client._session, "post", return_value=mock_response):
            with pytest.raises(Exception, match="500 Server Error"):
                client._post("positions")


class TestMyPositions:
    def test_abbrev_names(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        with patch.object(client, "_post", return_value={"DUKE": 10, "points": 500.0}) as mock:
            result = client.my_positions()
        mock.assert_called_once_with("positions", name="abbrev")
        assert result == {"DUKE": 10, "points": 500.0}

    def test_full_names(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        with patch.object(client, "_post", return_value={"Duke": 10}) as mock:
            result = client.my_positions(full_names=True)
        mock.assert_called_once_with("positions", name="full")
        assert result == {"Duke": 10}


class TestMyPortfolio:
    def test_returns_portfolio_with_cash(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        with patch.object(client, "_post", return_value={"DUKE": 10, "points": 2500.0}):
            portfolio = client.my_portfolio()
        assert isinstance(portfolio, Portfolio)
        assert portfolio.cash == 2500.0

    def test_missing_points_defaults_to_zero(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        with patch.object(client, "_post", return_value={"DUKE": 10}):
            portfolio = client.my_portfolio()
        assert portfolio.cash == 0.0


class TestMakeMarket:
    def test_sends_correct_params(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        with patch.object(client, "_post") as mock:
            client.make_market("Duke", bid=Decimal("2.50"), bid_size=5000,
                               ask=Decimal("2.60"), ask_size=5000)
        mock.assert_called_once_with(
            "make_market",
            team="Duke", bid="2.50", bid_size="5000",
            ask="2.60", ask_size="5000",
        )


class TestOrderBook:
    def test_get_orderbook(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        raw = {"bids": [{"price": 2.5, "quantity": 10}], "asks": []}
        with patch.object(client, "_post", return_value=raw) as mock:
            result = client.get_orderbook("Duke", depth=10)
        mock.assert_called_once_with("get_book", team="Duke", depth="10")
        assert result["bids"] == [{"price": 2.5, "quantity": 10}]
        assert result["asks"] == []


class TestOrderPlacement:
    def test_place_bid(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        with patch.object(client, "_post", return_value={"order_id": "abc-123"}) as mock:
            result = client.place_bid("Duke", 2.50, 100)
        mock.assert_called_once_with(
            "place_order",
            team_identifier="Duke", side="buy",
            price="2.5", quantity="100",
        )
        assert result == {"order_id": "abc-123"}

    def test_place_ask(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        with patch.object(client, "_post", return_value={"order_id": "def-456"}) as mock:
            result = client.place_ask("Duke", 3.00, 50)
        mock.assert_called_once_with(
            "place_order",
            team_identifier="Duke", side="sell",
            price="3.0", quantity="50",
        )
        assert result == {"order_id": "def-456"}

    def test_cancel_order(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        with patch.object(client, "_post") as mock:
            client.cancel_order("abc-123")
        mock.assert_called_once_with("cancel_order", order_id="abc-123")


class TestMarketData:
    def test_market_data(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        expected = {"DUKE": {"bid": 2.5, "bid_size": 10, "ask": 2.6, "ask_size": 15}}
        with patch.object(client, "_post", return_value=expected) as mock:
            result = client.market_data()
        mock.assert_called_once_with("market_data")
        assert result == expected

    def test_my_markets(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        expected = {"DUKE": {"position": 10, "bid": 2.5, "bid_size": 100}}
        with patch.object(client, "_post", return_value=expected) as mock:
            result = client.my_markets()
        mock.assert_called_once_with("my_markets")
        assert result == expected


class TestTradeHistory:
    def test_executions_defaults(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        with patch.object(client, "_post", return_value=[]) as mock:
            client.executions()
        mock.assert_called_once_with("executions")

    def test_executions_with_filters(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        with patch.object(client, "_post", return_value=[]) as mock:
            client.executions(mine_only=True, since="2026-01-01 00:00:00", n=50)
        mock.assert_called_once_with(
            "executions", mine_only="true",
            since="2026-01-01 00:00:00", n="50",
        )

    def test_open_orders(self):
        client = CixClient("test-apid", base_url="http://test:8000")
        with patch.object(client, "_post", return_value=[]) as mock:
            client.open_orders()
        mock.assert_called_once_with("open_orders")


class TestBracketValidation:
    GAME_CONFIG = {
        "game_name": "NCAA 2026",
        "game_type": "tournament",
        "teams": {
            "DUKE": "Duke",
            "UNC": "North Carolina",
            "KU": "Kansas",
            "UK": "Kentucky",
        },
    }

    def _make_client(self, bracket_teams=None):
        client = CixClient("test-apid", base_url="http://test:8000")
        if bracket_teams is not None:
            client.set_bracket_teams(bracket_teams)
        return client

    def _mock_post_for_validation(self, client):
        """Return a mock that handles game_config and positions calls."""
        original_post = client._post.__func__ if hasattr(client._post, '__func__') else None

        def side_effect(endpoint, **params):
            skip = params.pop("_skip_validation", False)
            if endpoint == "game_config":
                return self.GAME_CONFIG
            return {"Duke": 10, "points": 500.0}

        return side_effect

    def test_validation_passes_when_all_teams_match(self):
        client = self._make_client(["Duke", "North Carolina", "Kansas"])
        mock_response = MagicMock()

        call_count = 0
        def fake_post(url, data):
            nonlocal call_count
            call_count += 1
            mock_resp = MagicMock()
            if call_count == 1:
                # game_config call
                mock_resp.json.return_value = {
                    "success": True, "result": self.GAME_CONFIG,
                }
            else:
                # actual call
                mock_resp.json.return_value = {
                    "success": True, "result": {"Duke": 10, "points": 500.0},
                }
            return mock_resp

        with patch.object(client._session, "post", side_effect=fake_post):
            result = client.my_positions(full_names=True)
        assert result == {"Duke": 10, "points": 500.0}
        assert client._bracket_validated

    def test_validation_fails_with_missing_teams(self):
        client = self._make_client(["Duke", "Gonzaga", "Baylor"])

        def fake_post(url, data):
            mock_resp = MagicMock()
            mock_resp.json.return_value = {
                "success": True, "result": self.GAME_CONFIG,
            }
            return mock_resp

        with patch.object(client._session, "post", side_effect=fake_post):
            with pytest.raises(BracketMismatchError) as exc_info:
                client.my_positions()
            assert "Gonzaga" in str(exc_info.value)
            assert "Baylor" in str(exc_info.value)

    def test_validation_blocks_subsequent_calls(self):
        client = self._make_client(["Duke", "Gonzaga"])

        def fake_post(url, data):
            mock_resp = MagicMock()
            mock_resp.json.return_value = {
                "success": True, "result": self.GAME_CONFIG,
            }
            return mock_resp

        with patch.object(client._session, "post", side_effect=fake_post):
            with pytest.raises(BracketMismatchError):
                client.my_positions()

        # Subsequent call should also fail without hitting the network
        with pytest.raises(BracketMismatchError):
            client.market_data()

    def test_no_validation_without_bracket_teams(self):
        client = self._make_client()  # no bracket teams set
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "success": True, "result": {"Duke": 10},
        }
        with patch.object(client._session, "post", return_value=mock_response):
            result = client.my_positions(full_names=True)
        assert result == {"Duke": 10}

    def test_game_config_method(self):
        client = self._make_client()
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "success": True, "result": self.GAME_CONFIG,
        }
        with patch.object(client._session, "post", return_value=mock_response):
            config = client.game_config()
        assert config == self.GAME_CONFIG
        assert config["teams"]["DUKE"] == "Duke"

    def test_set_bracket_teams_resets_validation(self):
        client = self._make_client(["Duke"])

        def fake_post(url, data):
            mock_resp = MagicMock()
            mock_resp.json.return_value = {
                "success": True, "result": self.GAME_CONFIG,
            }
            return mock_resp

        # Validate successfully
        with patch.object(client._session, "post", side_effect=fake_post):
            client._validate_bracket()
        assert client._bracket_validated

        # Reset with new teams
        client.set_bracket_teams(["Gonzaga"])
        assert not client._bracket_validated
        assert client._validation_error is None

    def test_accessible_from_module(self):
        assert cix_client.BracketMismatchError is BracketMismatchError
