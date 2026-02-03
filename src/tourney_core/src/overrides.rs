use pyo3::prelude::*;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

/// Manual probability overrides for specific matchups.
///
/// Overrides are stored with team names in lexicographic order.
/// When retrieving an override, the probability is automatically
/// flipped if the teams are provided in reverse order.
#[pyclass]
#[derive(Clone, Debug, Default)]
pub struct OverridesMap {
    overrides: HashMap<(String, String), f64>,
}

#[pymethods]
impl OverridesMap {
    #[new]
    pub fn new() -> Self {
        OverridesMap {
            overrides: HashMap::new(),
        }
    }

    /// Read overrides from a CSV file.
    /// Format: team1,team2,probability
    pub fn read_from_file(&mut self, filepath: &str) -> PyResult<()> {
        let path = Path::new(filepath);
        let file = File::open(path).map_err(|e| {
            pyo3::exceptions::PyIOError::new_err(format!("Failed to open file: {}", e))
        })?;
        let reader = BufReader::new(file);

        for line in reader.lines() {
            let line = line.map_err(|e| {
                pyo3::exceptions::PyIOError::new_err(format!("Failed to read line: {}", e))
            })?;
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() != 3 {
                continue;
            }

            let name1 = parts[0].trim().to_string();
            let name2 = parts[1].trim().to_string();
            let prob: f64 = parts[2].trim().parse().map_err(|e| {
                pyo3::exceptions::PyValueError::new_err(format!("Invalid probability: {}", e))
            })?;

            self.add_override(&name1, &name2, prob);
        }

        Ok(())
    }

    /// Add or update an override for a matchup.
    pub fn add_override(&mut self, name1: &str, name2: &str, prob: f64) {
        let (key, value) = if name1 < name2 {
            ((name1.to_string(), name2.to_string()), prob)
        } else {
            ((name2.to_string(), name1.to_string()), 1.0 - prob)
        };
        self.overrides.insert(key, value);
    }

    /// Remove an override for a matchup.
    pub fn remove_override(&mut self, name1: &str, name2: &str) {
        let key = if name1 < name2 {
            (name1.to_string(), name2.to_string())
        } else {
            (name2.to_string(), name1.to_string())
        };
        self.overrides.remove(&key);
    }

    /// Get the override probability for a matchup, if one exists.
    /// Returns the probability of name1 beating name2.
    pub fn get_override(&self, name1: &str, name2: &str) -> Option<f64> {
        let (key, flip) = if name1 < name2 {
            ((name1.to_string(), name2.to_string()), false)
        } else {
            ((name2.to_string(), name1.to_string()), true)
        };
        self.overrides.get(&key).map(|&p| if flip { 1.0 - p } else { p })
    }

    /// Check if an override exists for a matchup.
    pub fn has_override(&self, name1: &str, name2: &str) -> bool {
        let key = if name1 < name2 {
            (name1.to_string(), name2.to_string())
        } else {
            (name2.to_string(), name1.to_string())
        };
        self.overrides.contains_key(&key)
    }

    /// Get the number of overrides.
    pub fn __len__(&self) -> usize {
        self.overrides.len()
    }

    fn __repr__(&self) -> String {
        format!("OverridesMap({} overrides)", self.overrides.len())
    }
}

impl OverridesMap {
    /// Get override without tracking (for internal Rust use)
    pub fn get(&self, name1: &str, name2: &str) -> Option<f64> {
        self.get_override(name1, name2)
    }
}
