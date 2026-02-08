//! Tourney Core - High-performance NCAA tournament scoring library.
//!
//! This library provides Rust implementations of tournament scoring algorithms
//! with Python bindings via PyO3.

use pyo3::prelude::*;
use std::collections::HashMap;

pub mod constants;
pub mod game_transform;
pub mod overrides;
pub mod portfolio;
pub mod team;
pub mod tournament;
pub mod win_prob;

pub use constants::{calcutta_points, AVG_SCORING, AVG_TEMPO, ROUND_POINTS, SCORING_STDDEV};
pub use overrides::OverridesMap;
pub use portfolio::{
    game_delta, get_all_team_deltas, get_portfolio_value, get_team_delta,
    get_team_pairwise_deltas, get_team_portfolio_delta, PortfolioState, TeamDelta,
};
pub use team::Team;
pub use tournament::TournamentState;
pub use win_prob::{calculate_expected_scores, calculate_win_prob};

/// Calculate win probability for a matchup.
///
/// Python-friendly wrapper around the core win probability function.
#[pyfunction]
#[pyo3(signature = (team1, team2, overrides = None, forfeit_prob = 0.0))]
fn py_calculate_win_prob(
    team1: &Team,
    team2: &Team,
    overrides: Option<&OverridesMap>,
    forfeit_prob: f64,
) -> f64 {
    calculate_win_prob(team1, team2, overrides, forfeit_prob)
}

/// Probabilistic game transformation.
#[pyfunction]
#[pyo3(signature = (child1, child2, teams, overrides = None, forfeit_prob = 0.0))]
fn py_game_transform_prob(
    child1: HashMap<String, f64>,
    child2: HashMap<String, f64>,
    teams: HashMap<String, Team>,
    overrides: Option<&OverridesMap>,
    forfeit_prob: f64,
) -> HashMap<String, f64> {
    game_transform::game_transform_prob(&child1, &child2, &teams, overrides, forfeit_prob)
}

/// Python module definition
#[pymodule]
fn tourney_core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    // Classes
    m.add_class::<Team>()?;
    m.add_class::<OverridesMap>()?;
    m.add_class::<TournamentState>()?;
    m.add_class::<PortfolioState>()?;
    m.add_class::<TeamDelta>()?;

    // Core functions
    m.add_function(wrap_pyfunction!(py_calculate_win_prob, m)?)?;
    m.add_function(wrap_pyfunction!(py_game_transform_prob, m)?)?;

    // Portfolio functions
    m.add_function(wrap_pyfunction!(get_portfolio_value, m)?)?;
    m.add_function(wrap_pyfunction!(game_delta, m)?)?;
    m.add_function(wrap_pyfunction!(get_team_delta, m)?)?;
    m.add_function(wrap_pyfunction!(get_team_portfolio_delta, m)?)?;
    m.add_function(wrap_pyfunction!(get_team_pairwise_deltas, m)?)?;
    m.add_function(wrap_pyfunction!(get_all_team_deltas, m)?)?;

    // Constants
    m.add("AVG_SCORING", AVG_SCORING)?;
    m.add("AVG_TEMPO", AVG_TEMPO)?;
    m.add("SCORING_STDDEV", SCORING_STDDEV)?;
    m.add("ROUND_POINTS", ROUND_POINTS.to_vec())?;
    m.add("CALCUTTA_POINTS", calcutta_points().to_vec())?;

    Ok(())
}
