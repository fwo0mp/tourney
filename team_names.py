"""
Team name equivalence classes.

Different data sources (ESPN, KenPom, CIX, betting odds API) use different
names for the same school. This module provides a central registry of name
equivalences and utilities to resolve names across sources.

Each equivalence class is a set of strings that all refer to the same school.
The first element listed is treated as the "canonical" name.
"""


# fmt: off
# Each tuple is an equivalence class. The first entry is the canonical name.
# Populated from: get_data.py NAME_CONVERSIONS, portfolio_value.py CIX_NAME_CONVERSIONS,
# make_markets.py canonicalize_name(), and CIX game_config full_name values.
EQUIVALENCE_CLASSES = [
    # Schools with many variant names across sources
    ("NC State", "N.C. State", "North Carolina St.", "North Carolina State", "Nc St.", "NCST"),
    ("UConn", "Connecticut", "Uconn"),
    ("USC", "Southern California", "Southern Cal"),
    ("VCU", "Virginia Commonwealth"),
    ("FDU", "Fairleigh Dickinson", "Fdu"),
    ("St. Mary's", "Saint Mary's", "St. Mary's (ca)"),
    ("St. John's", "Saint John's"),
    ("Texas A&M", "Texas Am", "Texas A&m;", "TAMU"),
    ("Texas Southern", "Texas So."),
    ("LSU", "Louisiana St.", "Louisiana State"),
    ("TCU", "Texas Christian"),
    ("BYU", "Brigham Young"),
    ("Ole Miss", "Mississippi"),
    ("Miami FL", "Miami", "Miami (FL)", "Miami (fl)"),

    # "State" vs "St." variants
    ("Michigan State", "Michigan St."),
    ("Iowa State", "Iowa St."),
    ("Florida State", "Florida St."),
    ("Mississippi State", "Mississippi St."),
    ("Oregon State", "Oregon St."),
    ("Oklahoma State", "Oklahoma St."),
    ("Kent State", "Kent St."),
    ("Wichita State", "Wichita St."),
    ("Utah State", "Utah St."),
    ("Boise State", "Boise St."),
    ("Colorado State", "Colorado St."),
    ("Arizona State", "Arizona St."),
    ("Ohio State", "Ohio St."),
    ("San Diego State", "San Diego St."),
    ("Georgia State", "Georgia St."),
    ("Middle Tennessee", "Middle Tennessee St.", "Middle Tennessee State"),
    ("SIU Edwardsville", "SIU-Edwardsville", "SIUE"),
    ("Southeast Missouri St.", "Se Missourist."),

    # Other abbreviation/spelling variants
    ("UMBC", "Md-baltimore County"),
    ("Penn", "Pennsylvania"),
    ("UNC Greensboro", "Uncg"),
    ("UC Santa Barbara", "UCSB"),
    ("Eastern Washington", "E. Washington"),
    ("Loyola Chicago", "Loyola-chicago", "Loyola (chi)"),
    ("Cal St. Fullerton", "CSU Fullerton", "Cs Fullerton", "Csu Fullerton"),
    ("Texas A&M Corpus Chris", "Texas A&m-cc", "Tamu-cc", "Texas A&M Corpus Christi"),
    ("Southeastern Louisiana", "Se Louisiana"),
    ("Arkansas Pine Bluff", "Arkansas-pine Bluff"),
    ("Louisiana", "Louisiana Lafayette"),
    ("Charleston", "College of Charleston"),
    ("Buffalo", "Suny-buffalo"),
    ("Gardner Webb", "Gardner-webb"),
    ("Florida Atlantic", "Fla. Atlantic"),
    ("Northern Kentucky", "No. Kentucky"),
    ("Ohio", "Ohio University"),
    ("UC Davis", "California Davis"),
    ("Nevada", "Nevada Reno"),
    ("Alabama", "Alabma"),  # historical typo in old data
    ("Abilene Christian", "Abilene Chrsitian"),  # historical typo in old data
    ("Mount St. Mary's", "Mt. St. Mary's"),
    ("SMU", "Southern Methodist"),
]
# fmt: on


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
