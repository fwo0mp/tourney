"""
Team name equivalence classes.

Different data sources (ESPN, KenPom, CIX, betting odds API) use different
names for the same school. This module provides a central registry of name
equivalences and utilities to resolve names across sources.

Equivalence classes are defined in team_names.yaml. Each list groups all known
names for one school; the first entry is the "canonical" name.
"""

from pathlib import Path

import yaml

_YAML_PATH = Path(__file__).parent / "team_names.yaml"

with open(_YAML_PATH) as _f:
    EQUIVALENCE_CLASSES = [tuple(entry) for entry in yaml.safe_load(_f)]


def _build_lookup():
    """Build the lookup dict from equivalence classes."""
    lookup = {}
    canonical = {}
    for equiv_class in EQUIVALENCE_CLASSES:
        names = frozenset(equiv_class)
        canon = equiv_class[0]
        for name in equiv_class:
            if name in lookup:
                raise ValueError(
                    f"Team name {name!r} appears in multiple equivalence classes"
                )
            lookup[name] = names
            canonical[name] = canon
    return lookup, canonical


_LOOKUP, _CANONICAL = _build_lookup()


def canonical_name(name):
    """Return the canonical name for a team, or the input unchanged if unknown."""
    return _CANONICAL.get(name, name)


def names_match(a, b):
    """Return True if two names refer to the same school."""
    if a == b:
        return True
    class_a = _LOOKUP.get(a)
    class_b = _LOOKUP.get(b)
    if class_a is not None and class_a is class_b:
        return True
    return False


def get_equivalent_names(name):
    """Return the set of all known names for a school, or {name} if unknown."""
    equiv = _LOOKUP.get(name)
    if equiv is not None:
        return equiv
    return frozenset({name})


def resolve_name(name, target_names):
    """Find the matching name in target_names for a given name.

    Looks for an exact match first, then checks equivalence classes.

    Args:
        name: The name to resolve.
        target_names: A collection of names to match against (e.g. from CIX
            game_config, or from ratings dict keys).

    Returns:
        The matching name from target_names.

    Raises:
        KeyError: If no match is found in target_names.
    """
    # Fast path: exact match
    if name in target_names:
        return name

    # Check equivalence class
    equivalents = _LOOKUP.get(name)
    if equivalents is not None:
        for equiv in equivalents:
            if equiv in target_names:
                return equiv

    raise KeyError(
        f"Cannot resolve team name {name!r}: "
        f"no match found in target names (and no equivalence class entry)"
    )


def try_resolve_name(name, target_names):
    """Like resolve_name but returns the original name instead of raising."""
    try:
        return resolve_name(name, target_names)
    except KeyError:
        return name
