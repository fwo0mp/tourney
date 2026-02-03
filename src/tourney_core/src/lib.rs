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

/// Read ratings from a file.
///
/// Returns a map of team names to Team objects.
#[pyfunction]
#[pyo3(signature = (filepath, adjustments = None))]
fn read_ratings_file(
    filepath: &str,
    adjustments: Option<HashMap<String, f64>>,
) -> PyResult<HashMap<String, Team>> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};
    use std::path::Path;

    let path = Path::new(filepath);
    let file = File::open(path).map_err(|e| {
        pyo3::exceptions::PyIOError::new_err(format!("Failed to open file: {}", e))
    })?;
    let reader = BufReader::new(file);

    let mut ratings = HashMap::new();

    for line in reader.lines() {
        let line = line.map_err(|e| {
            pyo3::exceptions::PyIOError::new_err(format!("Failed to read line: {}", e))
        })?;
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() < 4 {
            continue;
        }

        let name = parts[0].to_string();
        let mut offense: f64 = parts[1].parse().unwrap_or(0.0);
        let mut defense: f64 = parts[2].parse().unwrap_or(0.0);
        let tempo: f64 = parts[3].parse().unwrap_or(AVG_TEMPO);

        // Apply adjustments
        if let Some(ref adj_map) = adjustments {
            if let Some(&adj) = adj_map.get(&name) {
                offense += adj;
                defense -= adj;
            }
        }

        // Create team with adjust=true to convert to relative efficiency
        ratings.insert(name.clone(), Team::new(name, offense, defense, tempo, true));
    }

    Ok(ratings)
}

/// Read adjustments from a file.
///
/// Returns a map of team names to adjustment values.
#[pyfunction]
fn read_adjustments_file(filepath: &str) -> PyResult<HashMap<String, f64>> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};
    use std::path::Path;

    let path = Path::new(filepath);
    let file = File::open(path).map_err(|e| {
        pyo3::exceptions::PyIOError::new_err(format!("Failed to open file: {}", e))
    })?;
    let reader = BufReader::new(file);

    let mut adjustments = HashMap::new();

    for line in reader.lines() {
        let line = line.map_err(|e| {
            pyo3::exceptions::PyIOError::new_err(format!("Failed to read line: {}", e))
        })?;
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() != 2 {
            continue;
        }

        let name = parts[0].to_string();
        let adj_str = parts[1].trim_start_matches('+');
        let adj: f64 = adj_str.parse().unwrap_or(0.0);

        adjustments.insert(name, adj);
    }

    Ok(adjustments)
}

/// Read games from a bracket file.
///
/// Returns a list of game states (maps of team names to probabilities).
#[pyfunction]
#[pyo3(signature = (filepath, ratings, overrides = None))]
fn read_games_from_file(
    filepath: &str,
    ratings: HashMap<String, Team>,
    overrides: Option<&OverridesMap>,
) -> PyResult<Vec<HashMap<String, f64>>> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};
    use std::path::Path;

    let path = Path::new(filepath);
    let file = File::open(path).map_err(|e| {
        pyo3::exceptions::PyIOError::new_err(format!("Failed to open file: {}", e))
    })?;
    let reader = BufReader::new(file);

    let mut games = Vec::new();

    for line in reader.lines() {
        let line = line.map_err(|e| {
            pyo3::exceptions::PyIOError::new_err(format!("Failed to read line: {}", e))
        })?;
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split(',').collect();

        if parts.len() == 1 {
            // Single team (guaranteed winner)
            let mut game = HashMap::new();
            game.insert(parts[0].trim().to_string(), 1.0);
            games.push(game);
        } else if parts.len() == 2 {
            // Play-in game between two teams
            let name1 = parts[0].trim().to_string();
            let name2 = parts[1].trim().to_string();

            let team1 = ratings.get(&name1).ok_or_else(|| {
                pyo3::exceptions::PyKeyError::new_err(format!("Team not found: {}", name1))
            })?;
            let team2 = ratings.get(&name2).ok_or_else(|| {
                pyo3::exceptions::PyKeyError::new_err(format!("Team not found: {}", name2))
            })?;

            let win_prob = calculate_win_prob(team1, team2, overrides, 0.0);

            let mut game = HashMap::new();
            game.insert(name1, win_prob);
            game.insert(name2, 1.0 - win_prob);
            games.push(game);
        }
    }

    // Verify bracket is power of 2
    if games.is_empty() || (games.len() & (games.len() - 1)) != 0 {
        return Err(pyo3::exceptions::PyValueError::new_err(
            "Bracket must have a power-of-2 number of teams",
        ));
    }

    Ok(games)
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

    // File reading functions
    m.add_function(wrap_pyfunction!(read_ratings_file, m)?)?;
    m.add_function(wrap_pyfunction!(read_adjustments_file, m)?)?;
    m.add_function(wrap_pyfunction!(read_games_from_file, m)?)?;

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
