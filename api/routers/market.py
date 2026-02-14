"""Market API endpoints for orderbook, order placement, and market-making."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.services.cix_service import (
    CIXService,
    CIXConfigurationError,
    CIXUnavailableError,
    CIXUpstreamError,
    get_cix_service,
)

router = APIRouter(prefix="/market", tags=["market"])


class OrderRequest(BaseModel):
    """Order placement request."""

    side: str  # "buy" or "sell"
    price: float
    size: int


class OrderResponse(BaseModel):
    """Order placement response."""

    success: bool
    order_id: str | None = None
    error: str | None = None
    is_mock: bool = False


class OrderbookLevel(BaseModel):
    """A single level in the orderbook."""

    price: float
    size: int
    entry: str | None = None


class OrderbookResponse(BaseModel):
    """Orderbook response."""

    team: str
    bids: list[OrderbookLevel]
    asks: list[OrderbookLevel]
    is_mock: bool = False
    error: str | None = None


class MakeMarketRequest(BaseModel):
    """Make-market request (two-sided quote)."""

    bid: float
    bid_size: int
    ask: float
    ask_size: int


class MakeMarketResponse(BaseModel):
    """Make-market response."""

    success: bool
    team: str
    bid: float
    bid_size: int
    ask: float
    ask_size: int
    is_mock: bool = False
    error: str | None = None


class MyMarketEntry(BaseModel):
    """A single team's market-making entry."""

    bid: float | None = None
    bid_size: int | None = None
    ask: float | None = None
    ask_size: int | None = None
    position: int | None = None


class MyMarketsResponse(BaseModel):
    """Response for user's current markets."""

    markets: dict[str, MyMarketEntry]
    is_mock: bool = False


@router.get("/{team}/orderbook", response_model=OrderbookResponse)
def get_orderbook(
    team: str,
    cix: CIXService = Depends(get_cix_service),
):
    """Get current orderbook for a team."""
    try:
        result = cix.get_orderbook(team)
        return OrderbookResponse(
            team=result["team"],
            bids=[OrderbookLevel(**b) for b in result.get("bids", [])],
            asks=[OrderbookLevel(**a) for a in result.get("asks", [])],
            is_mock=result.get("is_mock", True),
            error=result.get("error"),
        )
    except CIXConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except CIXUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except CIXUpstreamError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{team}/make-market", response_model=MakeMarketResponse)
def make_market(
    team: str,
    request: MakeMarketRequest,
    cix: CIXService = Depends(get_cix_service),
):
    """Place or update a two-sided market for a team."""
    if request.bid >= request.ask:
        raise HTTPException(status_code=400, detail="Bid must be less than ask")
    if request.bid <= 0 or request.ask <= 0:
        raise HTTPException(status_code=400, detail="Prices must be positive")
    if request.bid_size <= 0 or request.ask_size <= 0:
        raise HTTPException(status_code=400, detail="Sizes must be positive")

    result = cix.make_market(
        team,
        bid=request.bid,
        bid_size=request.bid_size,
        ask=request.ask,
        ask_size=request.ask_size,
    )
    return MakeMarketResponse(
        success=result["success"],
        team=result["team"],
        bid=result["bid"],
        bid_size=result["bid_size"],
        ask=result["ask"],
        ask_size=result["ask_size"],
        is_mock=result.get("is_mock", True),
    )


@router.get("/my-markets", response_model=MyMarketsResponse)
def my_markets(
    cix: CIXService = Depends(get_cix_service),
):
    """Get user's current market-making orders for all teams."""
    result = cix.my_markets()
    markets = {
        team: MyMarketEntry(**data)
        for team, data in result["markets"].items()
    }
    return MyMarketsResponse(
        markets=markets,
        is_mock=result.get("is_mock", True),
    )


@router.post("/{team}/order", response_model=OrderResponse)
def place_order(
    team: str,
    order: OrderRequest,
    cix: CIXService = Depends(get_cix_service),
):
    """Place a buy or sell order for a team."""
    if order.side not in ("buy", "sell"):
        raise HTTPException(status_code=400, detail="Side must be 'buy' or 'sell'")

    if order.price <= 0:
        raise HTTPException(status_code=400, detail="Price must be positive")

    if order.size <= 0:
        raise HTTPException(status_code=400, detail="Size must be positive")

    try:
        result = cix.place_order(team, order.side, order.price, order.size)
        return OrderResponse(
            success=result["success"],
            order_id=result.get("order_id"),
            error=result.get("error"),
            is_mock=result.get("is_mock", True),
        )
    except CIXConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except CIXUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except CIXUpstreamError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/orders/{order_id}")
def cancel_order(
    order_id: str,
    cix: CIXService = Depends(get_cix_service),
):
    """Cancel an existing order."""
    try:
        result = cix.cancel_order(order_id)
        return result
    except CIXConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except CIXUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except CIXUpstreamError as e:
        raise HTTPException(status_code=502, detail=str(e))
