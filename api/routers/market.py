"""Market API endpoints for orderbook and order placement."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.services.cix_service import CIXService, get_cix_service

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


class OrderbookResponse(BaseModel):
    """Orderbook response."""

    team: str
    bids: list[OrderbookLevel]
    asks: list[OrderbookLevel]
    is_mock: bool = False
    error: str | None = None


@router.get("/{team}/orderbook", response_model=OrderbookResponse)
def get_orderbook(
    team: str,
    cix: CIXService = Depends(get_cix_service),
):
    """Get current orderbook for a team."""
    result = cix.get_orderbook(team)
    return OrderbookResponse(
        team=result["team"],
        bids=[OrderbookLevel(**b) for b in result.get("bids", [])],
        asks=[OrderbookLevel(**a) for a in result.get("asks", [])],
        is_mock=result.get("is_mock", True),
        error=result.get("error"),
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

    result = cix.place_order(team, order.side, order.price, order.size)
    return OrderResponse(
        success=result["success"],
        order_id=result.get("order_id"),
        error=result.get("error"),
        is_mock=result.get("is_mock", True),
    )


@router.delete("/orders/{order_id}")
def cancel_order(
    order_id: str,
    cix: CIXService = Depends(get_cix_service),
):
    """Cancel an existing order."""
    result = cix.cancel_order(order_id)
    return result
