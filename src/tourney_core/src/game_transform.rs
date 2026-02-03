use rand::Rng;
use std::collections::HashMap;

use crate::overrides::OverridesMap;
use crate::team::Team;
use crate::win_prob::calculate_win_prob;

/// Probabilistic game transformation.
///
/// Given two "child" game states (maps of team names to win probabilities),
/// computes the "parent" game state after playing the matchup.
///
/// # Arguments
/// * `child1` - First game's outcome distribution
/// * `child2` - Second game's outcome distribution
/// * `teams` - Map of team names to Team objects
/// * `overrides` - Optional probability overrides
/// * `forfeit_prob` - Probability of forfeit
///
/// # Returns
/// Map of team names to their probability of advancing
pub fn game_transform_prob(
    child1: &HashMap<String, f64>,
    child2: &HashMap<String, f64>,
    teams: &HashMap<String, Team>,
    overrides: Option<&OverridesMap>,
    forfeit_prob: f64,
) -> HashMap<String, f64> {
    let mut parent: HashMap<String, f64> = HashMap::new();

    for (name1, &win1) in child1.iter() {
        let team1 = &teams[name1];
        for (name2, &win2) in child2.iter() {
            let team2 = &teams[name2];
            let game_prob = win1 * win2;
            let p1 = calculate_win_prob(team1, team2, overrides, forfeit_prob);

            *parent.entry(name1.clone()).or_insert(0.0) += game_prob * p1;
            *parent.entry(name2.clone()).or_insert(0.0) += game_prob * (1.0 - p1);
        }
    }

    parent
}

/// Monte Carlo game simulation.
///
/// Given two child game states (each with exactly one team),
/// simulates the game outcome.
///
/// # Arguments
/// * `child1` - First game's winner
/// * `child2` - Second game's winner
/// * `teams` - Map of team names to Team objects
/// * `overrides` - Optional probability overrides
/// * `forfeit_prob` - Probability of forfeit
///
/// # Returns
/// Map with single team name (winner) mapping to 1.0
pub fn game_transform_sim<R: Rng>(
    child1: &HashMap<String, f64>,
    child2: &HashMap<String, f64>,
    teams: &HashMap<String, Team>,
    overrides: Option<&OverridesMap>,
    forfeit_prob: f64,
    rng: &mut R,
) -> HashMap<String, f64> {
    assert!(child1.len() == 1 && child2.len() == 1);

    let name1 = child1.keys().next().unwrap();
    let name2 = child2.keys().next().unwrap();

    let team1 = &teams[name1];
    let team2 = &teams[name2];

    // Simulate forfeits
    let team1_forfeit = rng.gen::<f64>() < forfeit_prob;
    let team2_forfeit = rng.gen::<f64>() < forfeit_prob;

    if team1_forfeit && team2_forfeit {
        // Both forfeit - this is an edge case, return empty
        // In practice this is extremely rare
        return HashMap::new();
    } else if team1_forfeit {
        let mut result = HashMap::new();
        result.insert(name2.clone(), 1.0);
        return result;
    } else if team2_forfeit {
        let mut result = HashMap::new();
        result.insert(name1.clone(), 1.0);
        return result;
    }

    // Normal game simulation
    let prob = calculate_win_prob(team1, team2, overrides, 0.0); // Don't double-apply forfeit
    let winner = if rng.gen::<f64>() < prob { name1 } else { name2 };

    let mut result = HashMap::new();
    result.insert(winner.clone(), 1.0);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_teams() -> HashMap<String, Team> {
        let mut teams = HashMap::new();
        teams.insert("A".to_string(), Team::new("A".to_string(), 0.05, -0.02, 68.0, false));
        teams.insert("B".to_string(), Team::new("B".to_string(), 0.03, 0.01, 70.0, false));
        teams.insert("C".to_string(), Team::new("C".to_string(), -0.02, 0.03, 66.0, false));
        teams.insert("D".to_string(), Team::new("D".to_string(), 0.0, 0.0, 67.7, false));
        teams
    }

    #[test]
    fn test_game_transform_prob_basic() {
        let teams = make_teams();

        let mut child1 = HashMap::new();
        child1.insert("A".to_string(), 1.0);

        let mut child2 = HashMap::new();
        child2.insert("B".to_string(), 1.0);

        let parent = game_transform_prob(&child1, &child2, &teams, None, 0.0);

        // Both teams should be in result
        assert!(parent.contains_key("A"));
        assert!(parent.contains_key("B"));

        // Probabilities should sum to 1
        let sum: f64 = parent.values().sum();
        assert!((sum - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_game_transform_prob_uncertain() {
        let teams = make_teams();

        // Child1: A (60%) or C (40%)
        let mut child1 = HashMap::new();
        child1.insert("A".to_string(), 0.6);
        child1.insert("C".to_string(), 0.4);

        // Child2: B (100%)
        let mut child2 = HashMap::new();
        child2.insert("B".to_string(), 1.0);

        let parent = game_transform_prob(&child1, &child2, &teams, None, 0.0);

        // All three teams could potentially win
        assert!(parent.contains_key("A"));
        assert!(parent.contains_key("B"));
        assert!(parent.contains_key("C"));

        // Probabilities should sum to 1
        let sum: f64 = parent.values().sum();
        assert!((sum - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_game_transform_sim() {
        let teams = make_teams();

        let mut child1 = HashMap::new();
        child1.insert("A".to_string(), 1.0);

        let mut child2 = HashMap::new();
        child2.insert("B".to_string(), 1.0);

        let mut rng = rand::thread_rng();
        let result = game_transform_sim(&child1, &child2, &teams, None, 0.0, &mut rng);

        // Should have exactly one winner
        assert_eq!(result.len(), 1);
        let (winner, prob) = result.iter().next().unwrap();
        assert!(*winner == "A" || *winner == "B");
        assert!((*prob - 1.0).abs() < 1e-10);
    }
}
