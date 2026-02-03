use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::collections::HashMap;
use tourney_core::constants::ROUND_POINTS;
use tourney_core::game_transform::game_transform_prob;
use tourney_core::portfolio::get_all_team_deltas;
use tourney_core::team::Team;
use tourney_core::tournament::TournamentState;
use tourney_core::win_prob::calculate_win_prob;

fn create_test_teams() -> (Team, Team) {
    let team1 = Team::new("Duke".to_string(), 0.05, -0.02, 68.0, false);
    let team2 = Team::new("UNC".to_string(), 0.03, 0.01, 70.0, false);
    (team1, team2)
}

fn create_64_team_tournament() -> TournamentState {
    let mut ratings = HashMap::new();
    let mut bracket = Vec::new();

    for i in 0..64 {
        let name = format!("Team{}", i);
        let offense = (i as f64 - 32.0) / 320.0; // -0.1 to 0.1
        let defense = ((i % 32) as f64 - 16.0) / 160.0;
        let tempo = 64.0 + (i as f64 % 8.0);

        ratings.insert(name.clone(), Team::new(name.clone(), offense, defense, tempo, false));

        let mut game = HashMap::new();
        game.insert(name, 1.0);
        bracket.push(game);
    }

    TournamentState::new(bracket, ratings, ROUND_POINTS.to_vec(), None, 0.0)
}

fn bench_calculate_win_prob(c: &mut Criterion) {
    let (team1, team2) = create_test_teams();

    c.bench_function("calculate_win_prob", |b| {
        b.iter(|| calculate_win_prob(black_box(&team1), black_box(&team2), None, 0.0))
    });
}

fn bench_game_transform_prob(c: &mut Criterion) {
    let tournament = create_64_team_tournament();

    let child1: HashMap<String, f64> = [
        ("Team0".to_string(), 0.6),
        ("Team1".to_string(), 0.4),
    ]
    .into_iter()
    .collect();

    let child2: HashMap<String, f64> = [
        ("Team2".to_string(), 0.55),
        ("Team3".to_string(), 0.45),
    ]
    .into_iter()
    .collect();

    c.bench_function("game_transform_prob_2x2", |b| {
        b.iter(|| {
            game_transform_prob(
                black_box(&child1),
                black_box(&child2),
                black_box(&tournament.ratings),
                None,
                0.0,
            )
        })
    });
}

fn bench_tournament_scoring(c: &mut Criterion) {
    let tournament = create_64_team_tournament();

    c.bench_function("tournament_64_team_scoring", |b| {
        b.iter(|| black_box(&tournament).calculate_scores_prob())
    });
}

fn bench_monte_carlo(c: &mut Criterion) {
    let tournament = create_64_team_tournament();

    c.bench_function("tournament_single_sim", |b| {
        b.iter(|| black_box(&tournament).calculate_scores_sim(Some(42)))
    });

    c.bench_function("tournament_1000_sims_batch", |b| {
        b.iter(|| black_box(&tournament).run_simulations(1000, Some(42)))
    });
}

fn bench_portfolio_deltas(c: &mut Criterion) {
    // Use smaller tournament for portfolio deltas (computationally intensive)
    let mut ratings = HashMap::new();
    let mut bracket = Vec::new();
    let mut positions = HashMap::new();

    for i in 0..16 {
        let name = format!("Team{}", i);
        let offense = (i as f64 - 8.0) / 80.0;
        let defense = ((i % 8) as f64 - 4.0) / 40.0;
        let tempo = 64.0 + (i as f64 % 8.0);

        ratings.insert(name.clone(), Team::new(name.clone(), offense, defense, tempo, false));

        let mut game = HashMap::new();
        game.insert(name.clone(), 1.0);
        bracket.push(game);

        if i % 2 == 0 {
            positions.insert(name, (i + 1) as f64);
        }
    }

    let tournament = TournamentState::new(bracket, ratings, vec![1.0, 1.0, 2.0, 2.0], None, 0.0);

    c.bench_function("get_all_team_deltas_16_teams", |b| {
        b.iter(|| get_all_team_deltas(black_box(positions.clone()), black_box(&tournament), 1.0))
    });
}

criterion_group!(
    benches,
    bench_calculate_win_prob,
    bench_game_transform_prob,
    bench_tournament_scoring,
    bench_monte_carlo,
    bench_portfolio_deltas,
);
criterion_main!(benches);
