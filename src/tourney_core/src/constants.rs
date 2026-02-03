/// National average scoring (points per 100 possessions)
pub const AVG_SCORING: f64 = 104.6;

/// National average tempo (possessions per game)
pub const AVG_TEMPO: f64 = 67.7;

/// Standard deviation of scoring margin
pub const SCORING_STDDEV: f64 = 11.0;

/// Points awarded per round in standard bracket scoring
pub const ROUND_POINTS: [f64; 6] = [1.0, 1.0, 2.0, 2.0, 2.0, 3.0];

/// Calcutta pool scoring multipliers (scaled by 15.5)
pub const CALCUTTA_MULTIPLIERS: [f64; 6] = [0.5, 1.25, 2.5, 7.75, 3.0, 7.0];

/// Get Calcutta points for each round
pub fn calcutta_points() -> [f64; 6] {
    let mut points = [0.0; 6];
    for (i, &mult) in CALCUTTA_MULTIPLIERS.iter().enumerate() {
        points[i] = 15.5 * mult;
    }
    points
}
