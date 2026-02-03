"""
Performance benchmarks comparing Python and Rust implementations.

Run with: uv run python tests/test_performance.py
"""

import sys
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import random
import time
from decimal import Decimal

# Reference Python implementation
import tourney_utils_reference as python_impl

# Rust implementation
import tourney_core as rust_impl


def benchmark_calculate_win_prob(iterations=100_000):
    """Benchmark win probability calculation."""
    print(f"\n=== Benchmarking calculate_win_prob ({iterations:,} iterations) ===")

    # Setup Python teams
    py_team1 = python_impl.Team("Duke", Decimal("0.05"), Decimal("-0.02"), Decimal("68.0"))
    py_team2 = python_impl.Team("UNC", Decimal("0.03"), Decimal("0.01"), Decimal("70.0"))

    # Setup Rust teams
    rust_team1 = rust_impl.Team("Duke", 0.05, -0.02, 68.0)
    rust_team2 = rust_impl.Team("UNC", 0.03, 0.01, 70.0)

    # Python benchmark
    start = time.perf_counter()
    for _ in range(iterations):
        python_impl.calculate_win_prob(py_team1, py_team2)
    py_time = time.perf_counter() - start

    # Rust benchmark
    start = time.perf_counter()
    for _ in range(iterations):
        rust_impl.py_calculate_win_prob(rust_team1, rust_team2)
    rust_time = time.perf_counter() - start

    print(f"Python: {py_time:.3f}s ({iterations/py_time:,.0f} ops/sec)")
    print(f"Rust:   {rust_time:.3f}s ({iterations/rust_time:,.0f} ops/sec)")
    print(f"Speedup: {py_time/rust_time:.1f}x")

    return py_time, rust_time


def benchmark_tournament_scoring(iterations=100):
    """Benchmark full tournament scoring."""
    print(f"\n=== Benchmarking tournament scoring ({iterations} iterations) ===")

    # Create 64-team bracket for Python
    py_ratings = {}
    py_bracket = []
    random.seed(42)
    for i in range(64):
        name = f"Team{i}"
        off = Decimal(str(random.uniform(-0.1, 0.1)))
        defense = Decimal(str(random.uniform(-0.1, 0.1)))
        tempo = Decimal(str(random.uniform(64, 72)))
        py_ratings[name] = python_impl.Team(name, off, defense, tempo)
        py_bracket.append({name: Decimal("1")})

    py_scoring = list(map(Decimal, [1, 1, 2, 2, 2, 3]))
    py_state = python_impl.TournamentState(py_bracket, py_ratings, py_scoring)

    # Create 64-team bracket for Rust
    rust_ratings = {}
    rust_bracket = []
    random.seed(42)
    for i in range(64):
        name = f"Team{i}"
        off = random.uniform(-0.1, 0.1)
        defense = random.uniform(-0.1, 0.1)
        tempo = random.uniform(64, 72)
        rust_ratings[name] = rust_impl.Team(name, off, defense, tempo)
        rust_bracket.append({name: 1.0})

    rust_scoring = [1.0, 1.0, 2.0, 2.0, 2.0, 3.0]
    rust_state = rust_impl.TournamentState(rust_bracket, rust_ratings, rust_scoring)

    # Python benchmark
    start = time.perf_counter()
    for _ in range(iterations):
        py_state.calculate_scores_prob()
    py_time = time.perf_counter() - start

    # Rust benchmark
    start = time.perf_counter()
    for _ in range(iterations):
        rust_state.calculate_scores_prob()
    rust_time = time.perf_counter() - start

    print(f"Python: {py_time:.3f}s ({iterations/py_time:.1f} brackets/sec)")
    print(f"Rust:   {rust_time:.3f}s ({iterations/rust_time:.1f} brackets/sec)")
    print(f"Speedup: {py_time/rust_time:.1f}x")

    return py_time, rust_time


def benchmark_monte_carlo_simulation(simulations=1000):
    """Benchmark Monte Carlo tournament simulation."""
    print(f"\n=== Benchmarking Monte Carlo simulation ({simulations} simulations) ===")

    # Create 64-team bracket for Rust only (Python is too slow for many simulations)
    rust_ratings = {}
    rust_bracket = []
    random.seed(42)
    for i in range(64):
        name = f"Team{i}"
        off = random.uniform(-0.1, 0.1)
        defense = random.uniform(-0.1, 0.1)
        tempo = random.uniform(64, 72)
        rust_ratings[name] = rust_impl.Team(name, off, defense, tempo)
        rust_bracket.append({name: 1.0})

    rust_scoring = [1.0, 1.0, 2.0, 2.0, 2.0, 3.0]
    rust_state = rust_impl.TournamentState(rust_bracket, rust_ratings, rust_scoring)

    # Rust benchmark for individual simulations
    start = time.perf_counter()
    for i in range(simulations):
        rust_state.calculate_scores_sim(seed=i)
    rust_time_individual = time.perf_counter() - start

    # Rust benchmark for batch simulations
    start = time.perf_counter()
    results = rust_state.run_simulations(simulations, seed=42)
    rust_time_batch = time.perf_counter() - start

    print(f"Rust (individual): {rust_time_individual:.3f}s ({simulations/rust_time_individual:.0f} sims/sec)")
    print(f"Rust (batch):      {rust_time_batch:.3f}s ({simulations/rust_time_batch:.0f} sims/sec)")
    print(f"Batch speedup: {rust_time_individual/rust_time_batch:.1f}x")

    return rust_time_individual, rust_time_batch


def benchmark_get_all_team_deltas():
    """Benchmark get_all_team_deltas (portfolio sensitivity analysis)."""
    print("\n=== Benchmarking get_all_team_deltas ===")

    # Create 16-team bracket for Rust (smaller for reasonable benchmark time)
    rust_ratings = {}
    rust_bracket = []
    positions = {}
    random.seed(42)
    for i in range(16):
        name = f"Team{i}"
        off = random.uniform(-0.1, 0.1)
        defense = random.uniform(-0.1, 0.1)
        tempo = random.uniform(64, 72)
        rust_ratings[name] = rust_impl.Team(name, off, defense, tempo)
        rust_bracket.append({name: 1.0})
        # Random positions
        if random.random() > 0.5:
            positions[name] = float(random.randint(1, 20))

    rust_scoring = [1.0, 1.0, 2.0, 2.0]
    rust_state = rust_impl.TournamentState(rust_bracket, rust_ratings, rust_scoring)

    # Benchmark
    iterations = 5
    start = time.perf_counter()
    for _ in range(iterations):
        rust_impl.get_all_team_deltas(positions, rust_state, 1.0)
    rust_time = time.perf_counter() - start

    print(f"Rust: {rust_time:.3f}s for {iterations} iterations")
    print(f"Average: {rust_time/iterations*1000:.1f}ms per call")
    print(f"(For 16 teams, this computes 32 full bracket calculations)")

    return rust_time


def main():
    print("=" * 60)
    print("Performance Benchmarks: Python vs Rust Implementation")
    print("=" * 60)

    # Run benchmarks
    benchmark_calculate_win_prob()
    benchmark_tournament_scoring()
    benchmark_monte_carlo_simulation()
    benchmark_get_all_team_deltas()

    print("\n" + "=" * 60)
    print("Benchmarks complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
