use pyo3::prelude::*;

use crate::constants::AVG_SCORING;

/// Team with offensive/defensive efficiency ratings and tempo.
///
/// Ratings are stored as relative efficiency (e.g., 0.05 means 5% above average).
#[pyclass]
#[derive(Clone, Debug)]
pub struct Team {
    #[pyo3(get, set)]
    pub name: String,

    /// Offensive efficiency relative to average (e.g., 0.05 = 5% above average)
    #[pyo3(get, set)]
    pub offense: f64,

    /// Defensive efficiency relative to average (e.g., -0.02 = 2% better than average)
    #[pyo3(get, set)]
    pub defense: f64,

    /// Expected possessions per game
    #[pyo3(get, set)]
    pub tempo: f64,
}

#[pymethods]
impl Team {
    /// Create a new Team.
    ///
    /// If `adjust` is true, converts raw efficiency ratings (e.g., 115.0 for offense)
    /// to relative efficiency (e.g., 0.099 for 115.0/104.6 - 1).
    #[new]
    #[pyo3(signature = (name, offense, defense, tempo, adjust = false))]
    pub fn new(name: String, offense: f64, defense: f64, tempo: f64, adjust: bool) -> Self {
        let (off, def) = if adjust {
            ((offense / AVG_SCORING) - 1.0, (defense / AVG_SCORING) - 1.0)
        } else {
            (offense, defense)
        };

        Team {
            name,
            offense: off,
            defense: def,
            tempo,
        }
    }

    /// Create a copy of this team
    pub fn copy(&self) -> Self {
        self.clone()
    }

    fn __str__(&self) -> String {
        format!("{}: {} | {} | {}", self.name, self.offense, self.defense, self.tempo)
    }

    fn __repr__(&self) -> String {
        format!("Team({:?}, {}, {}, {})", self.name, self.offense, self.defense, self.tempo)
    }
}

impl Team {
    /// Create a team with adjusted ratings (internal use)
    pub fn with_adjustment(&self, point_adjustment: f64) -> Self {
        let adj = point_adjustment / AVG_SCORING;
        Team {
            name: self.name.clone(),
            offense: self.offense + adj,
            defense: self.defense - adj,
            tempo: self.tempo,
        }
    }
}
