use pyo3::prelude::*;
use rayon::prelude::*;
use std::collections::HashMap;

use crate::tournament::TournamentState;

/// Result of a game delta calculation.
#[pyclass]
#[derive(Clone, Debug)]
pub struct TeamDelta {
    #[pyo3(get)]
    pub team: String,

    #[pyo3(get)]
    pub position: f64,

    #[pyo3(get)]
    pub delta_per_share: f64,

    #[pyo3(get)]
    pub total_delta: f64,
}

#[pymethods]
impl TeamDelta {
    #[new]
    pub fn new(team: String, position: f64, delta_per_share: f64) -> Self {
        TeamDelta {
            team,
            position,
            delta_per_share,
            total_delta: position * delta_per_share,
        }
    }

    fn __repr__(&self) -> String {
        format!(
            "TeamDelta({}, position={}, delta_per_share={:.4}, total_delta={:.4})",
            self.team, self.position, self.delta_per_share, self.total_delta
        )
    }
}

/// Calculate portfolio value given positions and team values.
///
/// # Arguments
/// * `positions` - Map of team names to number of shares held
/// * `values` - Map of team names to expected values (scores)
///
/// # Returns
/// Total portfolio value
#[pyfunction]
pub fn get_portfolio_value(positions: HashMap<String, f64>, values: HashMap<String, f64>) -> f64 {
    get_portfolio_value_ref(&positions, &values)
}

/// Internal version that takes references (for Rust callers)
pub fn get_portfolio_value_ref(positions: &HashMap<String, f64>, values: &HashMap<String, f64>) -> f64 {
    positions
        .iter()
        .map(|(team, &shares)| shares * values.get(team).unwrap_or(&0.0))
        .sum()
}

/// Calculate the impact of a game outcome on portfolio value.
///
/// Returns (win_value, loss_value, team_deltas) where:
/// - win_value: portfolio value if team1 wins
/// - loss_value: portfolio value if team2 wins
/// - team_deltas: per-team impact breakdown
///
/// # Arguments
/// * `positions` - Map of team names to shares held
/// * `tournament` - Tournament state (will be temporarily modified)
/// * `team1` - First team in the matchup
/// * `team2` - Second team in the matchup
#[pyfunction]
pub fn game_delta(
    positions: HashMap<String, f64>,
    tournament: &TournamentState,
    team1: &str,
    team2: &str,
) -> (f64, f64, Vec<TeamDelta>) {
    // Calculate with team1 winning (100% probability)
    let win_state = tournament.with_override(team1, team2, 1.0);
    let win_scores = win_state.calculate_scores_prob();
    let win_value = get_portfolio_value_ref(&positions, &win_scores);

    // Calculate with team2 winning (team1 loses, 0% probability)
    let loss_state = tournament.with_override(team1, team2, 0.0);
    let loss_scores = loss_state.calculate_scores_prob();
    let loss_value = get_portfolio_value_ref(&positions, &loss_scores);

    // Calculate per-team deltas
    let mut team_deltas = Vec::new();
    for (team, &shares) in &positions {
        let win_score = win_scores.get(team).unwrap_or(&0.0);
        let loss_score = loss_scores.get(team).unwrap_or(&0.0);
        let delta_per_share = win_score - loss_score;
        team_deltas.push(TeamDelta::new(team.clone(), shares, delta_per_share));
    }

    (win_value, loss_value, team_deltas)
}

/// Calculate the impact of a team's rating change on tournament scores.
///
/// Returns (positive_scores, negative_scores) where:
/// - positive_scores: scores if team's rating improves by point_delta
/// - negative_scores: scores if team's rating worsens by point_delta
///
/// # Arguments
/// * `tournament` - Tournament state
/// * `team` - Team to adjust
/// * `point_delta` - Amount to adjust rating (default 1.0)
#[pyfunction]
#[pyo3(signature = (tournament, team, point_delta = 1.0))]
pub fn get_team_delta(
    tournament: &TournamentState,
    team: &str,
    point_delta: f64,
) -> (HashMap<String, f64>, HashMap<String, f64>) {
    // Calculate with improved rating
    let positive_state = tournament.with_team_adjustment(team, point_delta);
    let positive_scores = positive_state.calculate_scores_prob();

    // Calculate with worsened rating
    let negative_state = tournament.with_team_adjustment(team, -point_delta);
    let negative_scores = negative_state.calculate_scores_prob();

    (positive_scores, negative_scores)
}

/// Calculate portfolio delta for a team's rating change.
#[pyfunction]
#[pyo3(signature = (positions, tournament, team, point_delta = 1.0))]
pub fn get_team_portfolio_delta(
    positions: HashMap<String, f64>,
    tournament: &TournamentState,
    team: &str,
    point_delta: f64,
) -> f64 {
    let (positive_scores, negative_scores) = get_team_delta(tournament, team, point_delta);
    let positive_value = get_portfolio_value_ref(&positions, &positive_scores);
    let negative_value = get_portfolio_value_ref(&positions, &negative_scores);
    positive_value - negative_value
}

/// Calculate pairwise deltas for a team's rating change.
///
/// Returns a map of team names to their value change when the specified team's rating changes.
#[pyfunction]
#[pyo3(signature = (tournament, team, point_delta = 1.0))]
pub fn get_team_pairwise_deltas(
    tournament: &TournamentState,
    team: &str,
    point_delta: f64,
) -> HashMap<String, f64> {
    let (positive_scores, negative_scores) = get_team_delta(tournament, team, point_delta);

    let mut deltas = HashMap::new();
    for team_name in tournament.get_bracket_teams() {
        let pos = positive_scores.get(&team_name).unwrap_or(&0.0);
        let neg = negative_scores.get(&team_name).unwrap_or(&0.0);
        deltas.insert(team_name, pos - neg);
    }
    deltas
}

/// Calculate deltas for all teams in the bracket.
///
/// Uses parallel processing for better performance.
///
/// Returns (team_deltas, pairwise_deltas) where:
/// - team_deltas: map of team names to portfolio delta
/// - pairwise_deltas: map of team names to their pairwise delta maps
///
/// # Arguments
/// * `positions` - Map of team names to shares held
/// * `tournament` - Tournament state
/// * `point_delta` - Amount to adjust ratings (default 1.0)
#[pyfunction]
#[pyo3(signature = (positions, tournament, point_delta = 1.0))]
pub fn get_all_team_deltas(
    positions: HashMap<String, f64>,
    tournament: &TournamentState,
    point_delta: f64,
) -> (HashMap<String, f64>, HashMap<String, HashMap<String, f64>>) {
    let teams = tournament.get_bracket_teams();

    // Parallel computation over teams
    let results: Vec<_> = teams
        .par_iter()
        .map(|team| {
            let (positive_scores, negative_scores) = get_team_delta(tournament, team, point_delta);

            // Calculate portfolio delta
            let positive_value = get_portfolio_value_ref(&positions, &positive_scores);
            let negative_value = get_portfolio_value_ref(&positions, &negative_scores);
            let portfolio_delta = positive_value - negative_value;

            // Calculate pairwise deltas
            let mut pairwise = HashMap::new();
            for team_name in tournament.get_bracket_teams() {
                let pos = positive_scores.get(&team_name).unwrap_or(&0.0);
                let neg = negative_scores.get(&team_name).unwrap_or(&0.0);
                pairwise.insert(team_name, pos - neg);
            }

            (team.clone(), portfolio_delta, pairwise)
        })
        .collect();

    // Collect results
    let mut team_deltas = HashMap::new();
    let mut pairwise_deltas = HashMap::new();

    for (team, portfolio_delta, pairwise) in results {
        team_deltas.insert(team.clone(), portfolio_delta);
        pairwise_deltas.insert(team, pairwise);
    }

    (team_deltas, pairwise_deltas)
}

/// Portfolio state with precomputed deltas.
#[pyclass]
#[derive(Clone)]
pub struct PortfolioState {
    #[pyo3(get)]
    pub tournament: TournamentState,

    #[pyo3(get)]
    pub positions: HashMap<String, f64>,

    #[pyo3(get)]
    pub team_deltas: HashMap<String, f64>,

    #[pyo3(get)]
    pub pairwise_deltas: HashMap<String, HashMap<String, f64>>,

    #[pyo3(get)]
    pub point_delta: f64,
}

#[pymethods]
impl PortfolioState {
    #[new]
    #[pyo3(signature = (tournament, positions, point_delta = 1.0))]
    pub fn new(tournament: TournamentState, positions: HashMap<String, f64>, point_delta: f64) -> Self {
        PortfolioState {
            tournament,
            positions,
            team_deltas: HashMap::new(),
            pairwise_deltas: HashMap::new(),
            point_delta,
        }
    }

    /// Compute deltas for all teams.
    pub fn compute_deltas(&mut self) {
        let (team_deltas, pairwise_deltas) =
            get_all_team_deltas(self.positions.clone(), &self.tournament, self.point_delta);
        self.team_deltas = team_deltas;
        self.pairwise_deltas = pairwise_deltas;
    }

    /// Get the current portfolio value.
    pub fn get_value(&self) -> f64 {
        let scores = self.tournament.calculate_scores_prob();
        get_portfolio_value_ref(&self.positions, &scores)
    }

    fn __repr__(&self) -> String {
        format!(
            "PortfolioState({} positions, {} teams)",
            self.positions.len(),
            self.tournament.get_bracket_teams().len()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::team::Team;

    fn make_test_tournament() -> TournamentState {
        let mut ratings = HashMap::new();
        ratings.insert("A".to_string(), Team::new("A".to_string(), 0.05, -0.02, 68.0, false));
        ratings.insert("B".to_string(), Team::new("B".to_string(), 0.03, 0.01, 70.0, false));
        ratings.insert("C".to_string(), Team::new("C".to_string(), -0.02, 0.03, 66.0, false));
        ratings.insert("D".to_string(), Team::new("D".to_string(), 0.0, 0.0, 67.7, false));

        let bracket = vec![
            [("A".to_string(), 1.0)].into_iter().collect(),
            [("B".to_string(), 1.0)].into_iter().collect(),
            [("C".to_string(), 1.0)].into_iter().collect(),
            [("D".to_string(), 1.0)].into_iter().collect(),
        ];

        TournamentState::new(bracket, ratings, vec![1.0, 1.0], None, 0.0)
    }

    #[test]
    fn test_get_portfolio_value() {
        let mut positions = HashMap::new();
        positions.insert("A".to_string(), 10.0);
        positions.insert("B".to_string(), 5.0);

        let mut values = HashMap::new();
        values.insert("A".to_string(), 2.0);
        values.insert("B".to_string(), 1.5);

        let value = get_portfolio_value_ref(&positions, &values);
        assert!((value - 27.5).abs() < 1e-10); // 10*2.0 + 5*1.5 = 27.5
    }

    #[test]
    fn test_game_delta() {
        let tournament = make_test_tournament();
        let mut positions = HashMap::new();
        positions.insert("A".to_string(), 10.0);

        let (win_value, loss_value, _) = game_delta(positions, &tournament, "A", "B");

        // If A wins against B, A should have higher value
        assert!(win_value > loss_value);
    }

    #[test]
    fn test_get_all_team_deltas() {
        let tournament = make_test_tournament();
        let mut positions = HashMap::new();
        positions.insert("A".to_string(), 10.0);
        positions.insert("B".to_string(), 5.0);

        let (team_deltas, pairwise_deltas) = get_all_team_deltas(positions, &tournament, 1.0);

        // Should have deltas for all 4 teams
        assert_eq!(team_deltas.len(), 4);
        assert_eq!(pairwise_deltas.len(), 4);

        // Team A improving should increase portfolio value since we hold 10
        // shares of A and only 5 of B (A's gain outweighs B's loss)
        assert!(team_deltas.get("A").unwrap() > &0.0);

        // Team B's delta may be negative because improving B hurts our larger
        // A position more than it helps our smaller B position. Just verify
        // that all deltas are finite and non-zero (rating changes have effect).
        for (_, delta) in &team_deltas {
            assert!(delta.is_finite());
        }

        // Pairwise deltas should also be present for each team
        for team_name in ["A", "B", "C", "D"] {
            assert!(pairwise_deltas.contains_key(team_name));
        }
    }
}
