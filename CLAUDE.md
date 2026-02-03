# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NCAA Basketball Tournament analytics tool that calculates expected scores using KenPom-style efficiency ratings and manages prediction market trades on CaseInsensitive (CIX).

## Commands

```bash
# Install dependencies
uv sync

# Calculate expected scores for tournament
uv run tourney_scorer.py expected bracket.txt ratings.txt

# Calculate win probability for a specific matchup
uv run tourney_scorer.py sim_game bracket.txt ratings.txt Team1 Team2

# Fetch KenPom ratings
uv run get_data.py ratings

# Fetch ESPN bracket
uv run get_data.py bracket

# Fetch betting odds
uv run get_data.py odds
```

## Architecture

**Core scoring engine (`tourney_utils.py`):**
- `Team` class stores offensive/defensive efficiency ratings and tempo
- `TournamentState` simulates tournament bracket round-by-round
- `calculate_win_prob()` computes win probability using point differential and normal distribution CDF
- Two modes: probabilistic (expected values) and Monte Carlo simulation

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

## Key Implementation Details

- All numerical calculations use Python `Decimal` for precision
- Team name normalization handled by `NAME_CONVERSIONS` dict and `clean_name()` in `get_data.py`
- `OverridesMap` stores probability overrides with automatic handling of team name ordering
- Scoring uses `ROUND_POINTS = [1, 1, 2, 2, 2, 3]` for standard or `CALCUTTA_POINTS` for calcutta pools
