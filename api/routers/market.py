"""Market API endpoints for orderbook, orders, and execution history."""

from fastapi import APIRouter, Depends, HTTPException, Query
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


class OrderbookResponse(BaseModel):
    """Orderbook response."""

    team: str
    bids: list[OrderbookLevel]
    asks: list[OrderbookLevel]
    is_mock: bool = False
    error: str | None = None


class ExecutionRecord(BaseModel):
    """A single execution/trade event."""

    time: str
    team: str
    side: str
    quantity: float
    price: float


class ExecutionsResponse(BaseModel):
    """Execution history response."""

    executions: list[ExecutionRecord]
    is_mock: bool = False
    error: str | None = None


@router.get("/executions", response_model=ExecutionsResponse)
def get_executions(
    mine_only: bool = Query(default=True),
    since: str | None = Query(
        default=None,
        description="Optional lower-bound timestamp (ISO or YYYY-MM-DD HH:MM:SS).",
    ),
    n: int = Query(default=300, ge=1, le=2000),
    cix: CIXService = Depends(get_cix_service),
):
    """Get recent execution history."""
    try:
        result = cix.get_executions(mine_only=mine_only, since=since, n=n)
        return ExecutionsResponse(
            executions=[ExecutionRecord(**e) for e in result.get("executions", [])],
            is_mock=result.get("is_mock", True),
            error=result.get("error"),
        )
    except CIXConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except CIXUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except CIXUpstreamError as e:
        raise HTTPException(status_code=502, detail=str(e))


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
