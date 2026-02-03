use pyo3::prelude::*;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use std::collections::HashMap;

use crate::game_transform::{game_transform_prob, game_transform_sim};
use crate::overrides::OverridesMap;
use crate::team::Team;

/// Tournament state containing bracket, ratings, and scoring rules.
#[pyclass]
#[derive(Clone)]
pub struct TournamentState {
    /// Bracket represented as games, each game is a map of team names to probabilities
    pub bracket: Vec<HashMap<String, f64>>,

    /// Team ratings lookup
    #[pyo3(get)]
    pub ratings: HashMap<String, Team>,

    /// Points awarded per round
    #[pyo3(get)]
    pub scoring: Vec<f64>,

    /// Manual probability overrides
    pub overrides: OverridesMap,

    /// Probability of a team forfeiting
    #[pyo3(get)]
    pub forfeit_prob: f64,
}

#[pymethods]
impl TournamentState {
    #[new]
    #[pyo3(signature = (bracket, ratings, scoring, overrides = None, forfeit_prob = 0.0))]
    pub fn new(
        bracket: Vec<HashMap<String, f64>>,
        ratings: HashMap<String, Team>,
        scoring: Vec<f64>,
        overrides: Option<OverridesMap>,
        forfeit_prob: f64,
    ) -> Self {
        TournamentState {
            bracket,
            ratings,
            scoring,
            overrides: overrides.unwrap_or_default(),
            forfeit_prob,
        }
    }

    /// Get the bracket
    #[getter]
    pub fn bracket(&self) -> Vec<HashMap<String, f64>> {
        self.bracket.clone()
    }

    /// Calculate expected scores using probabilistic method.
    ///
    /// Returns a map of team names to their expected tournament scores.
    pub fn calculate_scores_prob(&self) -> HashMap<String, f64> {
        self.calculate_scores_internal(false, None)
    }

    /// Simulate tournament once using Monte Carlo method.
    ///
    /// Returns a map of team names to their scores in this simulation.
    #[pyo3(signature = (seed = None))]
    pub fn calculate_scores_sim(&self, seed: Option<u64>) -> HashMap<String, f64> {
        self.calculate_scores_internal(true, seed)
    }

    /// Run multiple Monte Carlo simulations.
    ///
    /// Returns a vector of score maps, one for each simulation.
    #[pyo3(signature = (n_simulations, seed = None))]
    pub fn run_simulations(&self, n_simulations: usize, seed: Option<u64>) -> Vec<HashMap<String, f64>> {
        let mut results = Vec::with_capacity(n_simulations);
        let mut rng = match seed {
            Some(s) => ChaCha8Rng::seed_from_u64(s),
            None => ChaCha8Rng::from_entropy(),
        };

        for _ in 0..n_simulations {
            let sim_seed = rng.gen::<u64>();
            results.push(self.calculate_scores_internal(true, Some(sim_seed)));
        }

        results
    }

    /// Get all teams in the bracket.
    pub fn get_bracket_teams(&self) -> Vec<String> {
        let mut teams = Vec::new();
        for game in &self.bracket {
            for team in game.keys() {
                if !teams.contains(team) {
                    teams.push(team.clone());
                }
            }
        }
        teams
    }

    /// Get the overrides map
    #[getter]
    pub fn overrides(&self) -> OverridesMap {
        self.overrides.clone()
    }

    /// Set the overrides map
    #[setter]
    pub fn set_overrides(&mut self, overrides: OverridesMap) {
        self.overrides = overrides;
    }

    fn __repr__(&self) -> String {
        format!(
            "TournamentState({} teams, {} rounds)",
            self.bracket.len(),
            self.scoring.len()
        )
    }
}

impl TournamentState {
    /// Internal scoring implementation.
    fn calculate_scores_internal(&self, simulate: bool, seed: Option<u64>) -> HashMap<String, f64> {
        let mut total_scores: HashMap<String, f64> = HashMap::new();
        let mut games = self.bracket.clone();
        let mut round = 0;

        let mut rng = match seed {
            Some(s) => ChaCha8Rng::seed_from_u64(s),
            None => ChaCha8Rng::from_entropy(),
        };

        while games.len() > 1 {
            let mut new_games = Vec::new();

            for i in (0..games.len()).step_by(2) {
                let parent = if simulate {
                    game_transform_sim(
                        &games[i],
                        &games[i + 1],
                        &self.ratings,
                        Some(&self.overrides),
                        self.forfeit_prob,
                        &mut rng,
                    )
                } else {
                    game_transform_prob(
                        &games[i],
                        &games[i + 1],
                        &self.ratings,
                        Some(&self.overrides),
                        self.forfeit_prob,
                    )
                };

                // Add scores for this round
                let round_points = self.scoring.get(round).copied().unwrap_or(1.0);
                for (team, win_prob) in &parent {
                    *total_scores.entry(team.clone()).or_insert(0.0) += win_prob * round_points;
                }

                new_games.push(parent);
            }

            games = new_games;
            round += 1;
        }

        total_scores
    }

    /// Create a modified copy with an override added
    pub fn with_override(&self, team1: &str, team2: &str, prob: f64) -> Self {
        let mut new_state = self.clone();
        new_state.overrides.add_override(team1, team2, prob);
        new_state
    }

    /// Create a modified copy with a team's rating adjusted
    pub fn with_team_adjustment(&self, team_name: &str, point_delta: f64) -> Self {
        let mut new_state = self.clone();
        if let Some(team) = new_state.ratings.get_mut(team_name) {
            *team = team.with_adjustment(point_delta);
        }
        new_state
    }
}

use rand::Rng;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::ROUND_POINTS;

    fn make_simple_bracket() -> (Vec<HashMap<String, f64>>, HashMap<String, Team>) {
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

        (bracket, ratings)
    }

    #[test]
    fn test_calculate_scores_prob() {
        let (bracket, ratings) = make_simple_bracket();
        let scoring = ROUND_POINTS.to_vec();

        let state = TournamentState::new(bracket, ratings, scoring, None, 0.0);
        let scores = state.calculate_scores_prob();

        // All 4 teams should have scores
        assert_eq!(scores.len(), 4);

        // Total score should equal sum of all points available
        // Round 1: 4 teams can advance (4 * 1.0)
        // Round 2: 2 teams can advance (2 * 1.0)
        // But we only have 2 rounds for 4 teams
        let total: f64 = scores.values().sum();
        // First round: all 4 teams play, total points = 2 * 1.0 = 2.0 (two games)
        // Second round: 2 winners play, total points = 1 * 1.0 = 1.0 (one game)
        // Wait, that's not right. Let me think...
        // Each team that wins a game gets points. With 4 teams:
        // Round 1: 2 games, 2 winners, each gets 1 point = 2 total
        // Round 2: 1 game, 1 winner, gets 1 point = 1 total
        // Total: 3 points
        assert!((total - 3.0).abs() < 0.01, "Total score should be ~3.0, got {}", total);
    }

    #[test]
    fn test_calculate_scores_sim_deterministic() {
        let (bracket, ratings) = make_simple_bracket();
        let scoring = ROUND_POINTS.to_vec();

        let state = TournamentState::new(bracket, ratings, scoring, None, 0.0);

        // With same seed, should get same result
        let scores1 = state.calculate_scores_sim(Some(42));
        let scores2 = state.calculate_scores_sim(Some(42));

        for (team, score1) in &scores1 {
            let score2 = scores2.get(team).unwrap_or(&0.0);
            assert!((score1 - score2).abs() < 1e-10);
        }
    }

    #[test]
    fn test_get_bracket_teams() {
        let (bracket, ratings) = make_simple_bracket();
        let state = TournamentState::new(bracket, ratings, vec![1.0, 1.0], None, 0.0);

        let teams = state.get_bracket_teams();
        assert_eq!(teams.len(), 4);
        assert!(teams.contains(&"A".to_string()));
        assert!(teams.contains(&"B".to_string()));
        assert!(teams.contains(&"C".to_string()));
        assert!(teams.contains(&"D".to_string()));
    }
}
