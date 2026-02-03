# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NCAA Basketball Tournament analytics tool that calculates expected scores using KenPom-style efficiency ratings and manages prediction market trades on CaseInsensitive (CIX).

## Commands

```bash
# Install dependencies (builds Rust extension automatically)
uv sync

# Calculate expected scores for tournament
uv run tourney_scorer.py expected bracket.txt ratings.txt

# Calculate with verification against reference implementation
uv run tourney_scorer.py expected bracket.txt ratings.txt --verify

# Calculate win probability for a specific matchup
uv run tourney_scorer.py sim_game bracket.txt ratings.txt Team1 Team2

# Fetch KenPom ratings
uv run get_data.py ratings

# Fetch ESPN bracket
uv run get_data.py bracket

# Fetch betting odds
uv run get_data.py odds

# Run tests
uv run pytest tests/

# Run performance benchmarks
uv run python tests/test_performance.py
```

## Architecture

**Core scoring engine (`tourney_utils.py` - Rust-backed):**
- `Team` class stores offensive/defensive efficiency ratings and tempo
- `TournamentState` simulates tournament bracket round-by-round
- `calculate_win_prob()` computes win probability using point differential and normal distribution CDF
- Two modes: probabilistic (expected values) and Monte Carlo simulation
- 85-318x faster than pure Python

**Win probability model:**
- Uses KenPom adjusted efficiency (offense/defense relative to 104.6 national average)
- Tempo calculated as product of team tempos normalized by 67.7 average
- Point differential converted to win probability via normal CDF with tempo-scaled standard deviation

**Data files:**
- `bracket.txt` - Teams in bracket order (comma-separated pairs for play-in games)
- `ratings.txt` - Format: `TeamName|Offense|Defense|Tempo`
- `adjustments.txt` - Format: `TeamName|±adjustment` for manual rating tweaks
- `overrides.txt` - Format: `Team1,Team2,probability` to override calculated probabilities

**External integrations:**
- KenPom (web scraping for ratings)
- ESPN (bracket data)
- The Odds API (betting market odds, requires `ODDS_API_KEY` in `.env`)
- CIX prediction market (requires `CIX_APID` in `.env`, uses external `cix_client` module)

## Source Structure

**Main modules (Rust-backed):**
- `tourney_utils.py` - Tournament scoring, uses Rust backend
- `portfolio_value.py` - Portfolio delta calculations, uses Rust backend
- `tourney_scorer.py` - CLI entry point

**Reference implementations (pure Python):**
- `tourney_utils_reference.py` - Original Python implementation
- `portfolio_value_reference.py` - Original Python implementation

**Rust crate:**
- `src/tourney_core/` - PyO3 bindings for high-performance calculations

**Tests:**
- `tests/test_equivalence.py` - Verify Rust matches Python reference
- `tests/test_performance.py` - Benchmark comparisons

## Verification

Use `--verify` flag to run both implementations and compare:

```bash
uv run tourney_scorer.py expected bracket.txt ratings.txt --verify
```

Or programmatically:
```python
import tourney_utils as tourney

# Verify tournament scoring
scores, is_equivalent, max_diff, differences = tourney.verify_tournament_scores(state)

# Verify win probability
result, is_equivalent, ref_result, diff = tourney.verify_calculate_win_prob(team1, team2)
```

## Key Implementation Details

- Main modules use Rust via `tourney_core`; reference implementations use pure Python with `Decimal`
- Team name normalization handled by `NAME_CONVERSIONS` dict and `clean_name()` in `get_data.py`
- `OverridesMap` stores probability overrides with automatic handling of team name ordering
- Scoring uses `ROUND_POINTS = [1, 1, 2, 2, 2, 3]` for standard or `CALCUTTA_POINTS` for calcutta pools
