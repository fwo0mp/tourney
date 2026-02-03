#!/usr/bin/env python
"""
Tournament scorer - Calculate expected scores for NCAA tournament teams.

Uses high-performance Rust backend by default. Use --verify to compare
against the reference Python implementation.
"""

import argparse
import sys
from dotenv import load_dotenv

import tourney_utils as tourney

load_dotenv()


def run_expected(state, args, verify=False):
    """Calculate expected scores for all teams."""
    if args.sort == "name":
        sorter = lambda g: g[0]
    else:
        sorter = lambda g: -1 * g[1]

    if verify:
        team_scores, is_equivalent, max_diff, differences = tourney.verify_tournament_scores(
            state, tolerance=1e-6
        )
        print(f"# Verification: {'PASS' if is_equivalent else 'FAIL'} (max diff: {max_diff:.2e})")
    else:
        team_scores = state.calculate_scores_prob()

    total_score = 0.0

    for team, score in sorted(team_scores.items(), key=sorter):
        print(f"{team},{score:.3f}")
        total_score += score

    print(f"Total: {total_score:.3f}")


def run_sim_game(state, args, verify=False):
    """Calculate win probability for a specific matchup."""
    team1_name = args.teams[0]
    team2_name = args.teams[1]

    team1 = state.ratings[team1_name]
    team2 = state.ratings[team2_name]

    if verify:
        result, is_equivalent, ref_result, diff = tourney.verify_calculate_win_prob(
            team1, team2, state.overrides, state.forfeit_prob
        )
        print(f"# Verification: {'PASS' if is_equivalent else 'FAIL'} (diff: {diff:.2e})")
        print(f"# Reference: {ref_result:.6f}")
    else:
        result = tourney.calculate_win_prob(team1, team2, state.overrides, state.forfeit_prob)

    print(f"{result:.3f}")


def run_portfolio_simulate(state, args, verify=False):
    """Simulate portfolio values across tournament outcomes."""
    import portfolio_value as pv
    import os

    try:
        import cix_client
        client = cix_client.CixClient(os.getenv("CIX_APID"))
        positions = client.my_positions()
    except Exception as e:
        print(f"Error getting positions: {e}", file=sys.stderr)
        return

    portfolio_values = []
    for i in range(args.simulations):
        scores = state.calculate_scores_sim(seed=i)
        value = pv.get_portfolio_value(positions, scores)
        portfolio_values.append(value)

    portfolio_values = sorted(portfolio_values)
    percentiles = [1, 10, 25, 50, 75, 90, 99]

    print(f"min value: {portfolio_values[0]:.2f}")
    for percentile in percentiles:
        idx = (percentile * args.simulations) // 100
        print(f"{percentile} percentile value: {portfolio_values[idx]:.2f}")
    print(f"max value: {portfolio_values[-1]:.2f}")


def main():
    parser = argparse.ArgumentParser(
        description="Calculate expected tournament scores using Rust backend"
    )
    parser.add_argument(
        "operation",
        choices=["expected", "portfolio_simulate", "portfolio_expected", "sim_game"],
        help="Operation to perform",
    )
    parser.add_argument("bracket_file", help="Path to bracket file")
    parser.add_argument("ratings_file", help="Path to ratings file")
    parser.add_argument("teams", nargs="*", help="Team names (for sim_game)")
    parser.add_argument("--adjustments", help="Path to adjustments file")
    parser.add_argument("--overrides", action="append", help="Path to overrides file(s)")
    parser.add_argument(
        "--sort",
        default="name",
        choices=["name", "score"],
        help="Sort order for output",
    )
    parser.add_argument("--calcutta", action="store_true", help="Use Calcutta scoring")
    parser.add_argument(
        "--simulations",
        type=int,
        default=10000,
        help="Number of simulations for portfolio_simulate",
    )
    parser.add_argument(
        "--forfeit_prob",
        type=float,
        default=0.0,
        help="Probability of team forfeiting (0.0-1.0)",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Verify results against reference Python implementation",
    )

    args = parser.parse_args()

    # Validate forfeit probability
    if args.forfeit_prob < 0.0 or args.forfeit_prob >= 1.0:
        sys.stderr.write("invalid forfeit probability\n")
        sys.exit(1)

    # Load adjustments
    if args.adjustments:
        adjustments = tourney.read_adjustments_file(args.adjustments)
    else:
        adjustments = None

    # Load ratings
    ratings = tourney.read_ratings_file(args.ratings_file, adjustments)

    # Select scoring system
    if args.calcutta:
        scoring = list(tourney.CALCUTTA_POINTS)
    else:
        scoring = list(tourney.ROUND_POINTS)

    # Load overrides
    overrides = tourney.OverridesMap()
    if args.overrides:
        for overrides_file in args.overrides:
            overrides.read_from_file(overrides_file)

    # Load bracket
    games = tourney.read_games_from_file(args.bracket_file, ratings, overrides)

    # Create tournament state
    state = tourney.TournamentState(
        bracket=games,
        ratings=ratings,
        scoring=scoring,
        overrides=overrides,
        forfeit_prob=args.forfeit_prob,
    )

    # Execute operation
    if args.operation == "expected":
        run_expected(state, args, verify=args.verify)
    elif args.operation == "sim_game":
        if len(args.teams) < 2:
            sys.stderr.write("sim_game requires two team names\n")
            sys.exit(1)
        run_sim_game(state, args, verify=args.verify)
    elif args.operation == "portfolio_simulate":
        run_portfolio_simulate(state, args, verify=args.verify)
    elif args.operation == "portfolio_expected":
        print("portfolio_expected not yet implemented")
    else:
        print("invalid operation")


if __name__ == "__main__":
    main()
