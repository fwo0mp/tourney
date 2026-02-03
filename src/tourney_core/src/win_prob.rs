use statrs::distribution::{ContinuousCDF, Normal};

use crate::constants::{AVG_SCORING, AVG_TEMPO, SCORING_STDDEV};
use crate::overrides::OverridesMap;
use crate::team::Team;

/// Calculate the probability of team1 beating team2.
///
/// Uses KenPom-style efficiency ratings with normal distribution
/// approximation for win probability.
///
/// # Arguments
/// * `team1` - First team
/// * `team2` - Second team
/// * `overrides` - Optional manual probability overrides
/// * `forfeit_prob` - Probability of a team forfeiting (0.0-1.0)
///
/// # Returns
/// Probability of team1 winning (0.0-1.0)
pub fn calculate_win_prob(
    team1: &Team,
    team2: &Team,
    overrides: Option<&OverridesMap>,
    forfeit_prob: f64,
) -> f64 {
    // Check for manual override first
    if let Some(ovr) = overrides {
        if let Some(prob) = ovr.get(&team1.name, &team2.name) {
            return prob;
        }
    }

    // Calculate expected possessions per team
    let tempo = (team1.tempo * team2.tempo) / AVG_TEMPO;

    // Teams' points per possession as percentage of national average
    let team1_scoring = 1.0 + team1.offense + team2.defense;
    let team2_scoring = 1.0 + team2.offense + team1.defense;

    // Teams' actual points per possession
    let team1_ppp = team1_scoring * (AVG_SCORING / 100.0);
    let team2_ppp = team2_scoring * (AVG_SCORING / 100.0);

    // Expected point differential
    let team1_score = team1_ppp * tempo;
    let team2_score = team2_ppp * tempo;
    let point_diff = team1_score - team2_score;

    // Standard deviation scales with tempo and scoring rates
    let stddev = ((team1_scoring + team2_scoring) / 2.0) * (tempo / AVG_TEMPO) * SCORING_STDDEV;

    // Use normal CDF to convert point differential to win probability
    let normal = Normal::new(0.0, 1.0).unwrap();
    let game_win_prob = normal.cdf(point_diff / stddev);

    // Forfeit probability adjustments
    if forfeit_prob > 0.0 {
        let forfeit_win_prob = forfeit_prob * (1.0 - forfeit_prob);
        let forfeit_tie_prob = forfeit_prob * forfeit_prob;
        let game_play_prob = 1.0 - (2.0 * forfeit_win_prob + forfeit_tie_prob);

        forfeit_win_prob + (0.5 * forfeit_tie_prob) + (game_play_prob * game_win_prob)
    } else {
        game_win_prob
    }
}

/// Calculate expected scores for a matchup.
///
/// Returns (team1_expected_score, team2_expected_score)
pub fn calculate_expected_scores(team1: &Team, team2: &Team) -> (f64, f64) {
    let tempo = (team1.tempo * team2.tempo) / AVG_TEMPO;

    let team1_scoring = 1.0 + team1.offense + team2.defense;
    let team2_scoring = 1.0 + team2.offense + team1.defense;

    let team1_ppp = team1_scoring * (AVG_SCORING / 100.0);
    let team2_ppp = team2_scoring * (AVG_SCORING / 100.0);

    (team1_ppp * tempo, team2_ppp * tempo)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_equal_teams_50_50() {
        let team1 = Team::new("A".to_string(), 0.0, 0.0, 67.7, false);
        let team2 = Team::new("B".to_string(), 0.0, 0.0, 67.7, false);

        let prob = calculate_win_prob(&team1, &team2, None, 0.0);
        assert!((prob - 0.5).abs() < 0.001, "Equal teams should have ~50% win probability");
    }

    #[test]
    fn test_better_team_favored() {
        let strong = Team::new("Strong".to_string(), 0.1, -0.05, 70.0, false);
        let weak = Team::new("Weak".to_string(), -0.05, 0.1, 65.0, false);

        let prob = calculate_win_prob(&strong, &weak, None, 0.0);
        assert!(prob > 0.7, "Strong team should be heavily favored");
        assert!(prob < 1.0, "Probability should be less than 1");
    }

    #[test]
    fn test_probability_bounds() {
        let team1 = Team::new("A".to_string(), 0.2, -0.2, 75.0, false);
        let team2 = Team::new("B".to_string(), -0.2, 0.2, 60.0, false);

        let prob = calculate_win_prob(&team1, &team2, None, 0.0);
        assert!(prob >= 0.0 && prob <= 1.0, "Probability must be in [0, 1]");
    }

    #[test]
    fn test_symmetric() {
        let team1 = Team::new("Duke".to_string(), 0.05, -0.02, 68.0, false);
        let team2 = Team::new("UNC".to_string(), 0.03, 0.01, 70.0, false);

        let prob1 = calculate_win_prob(&team1, &team2, None, 0.0);
        let prob2 = calculate_win_prob(&team2, &team1, None, 0.0);

        assert!((prob1 + prob2 - 1.0).abs() < 1e-10, "P(A beats B) + P(B beats A) should equal 1");
    }

    #[test]
    fn test_override_used() {
        let team1 = Team::new("A".to_string(), 0.0, 0.0, 67.7, false);
        let team2 = Team::new("B".to_string(), 0.0, 0.0, 67.7, false);

        let mut overrides = OverridesMap::new();
        overrides.add_override("A", "B", 0.75);

        let prob = calculate_win_prob(&team1, &team2, Some(&overrides), 0.0);
        assert!((prob - 0.75).abs() < 1e-10, "Override should be used");
    }
}
