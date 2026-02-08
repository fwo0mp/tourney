"""Tests for team_names equivalence classes."""

import pytest

from team_names import (
    EQUIVALENCE_CLASSES,
    canonical_name,
    names_match,
    get_equivalent_names,
    resolve_name,
    try_resolve_name,
)


class TestEquivalenceClassIntegrity:
    def test_no_duplicate_names_across_classes(self):
        seen = {}
        for equiv_class in EQUIVALENCE_CLASSES:
            for name in equiv_class:
                assert name not in seen, (
                    f"{name!r} appears in multiple equivalence classes: "
                    f"{seen[name]} and {equiv_class}"
                )
                seen[name] = equiv_class

    def test_all_classes_have_at_least_two_entries(self):
        for equiv_class in EQUIVALENCE_CLASSES:
            assert len(equiv_class) >= 2, (
                f"Equivalence class {equiv_class} has fewer than 2 entries"
            )


class TestCanonicalName:
    def test_known_name(self):
        assert canonical_name("Connecticut") == "UConn"
        assert canonical_name("Uconn") == "UConn"

    def test_canonical_returns_itself(self):
        assert canonical_name("UConn") == "UConn"

    def test_unknown_name_returns_input(self):
        assert canonical_name("Totally Unknown School") == "Totally Unknown School"

    def test_nc_state_variants(self):
        assert canonical_name("N.C. State") == "NC State"
        assert canonical_name("North Carolina St.") == "NC State"
        assert canonical_name("North Carolina State") == "NC State"
        assert canonical_name("NC State") == "NC State"

    def test_state_abbreviation_variants(self):
        assert canonical_name("Michigan St.") == "Michigan State"
        assert canonical_name("Iowa St.") == "Iowa State"
        assert canonical_name("Florida St.") == "Florida State"


class TestNamesMatch:
    def test_exact_match(self):
        assert names_match("Duke", "Duke")

    def test_equivalent_names(self):
        assert names_match("UConn", "Connecticut")
        assert names_match("Connecticut", "UConn")

    def test_non_matching(self):
        assert not names_match("Duke", "North Carolina")

    def test_unknown_names_only_match_exact(self):
        assert names_match("Unknown School", "Unknown School")
        assert not names_match("Unknown School", "Another Unknown")

    def test_known_vs_unknown(self):
        assert not names_match("Duke", "UConn")


class TestGetEquivalentNames:
    def test_known_name(self):
        names = get_equivalent_names("UConn")
        assert "UConn" in names
        assert "Connecticut" in names
        assert "Uconn" in names

    def test_unknown_name(self):
        names = get_equivalent_names("Unknown School")
        assert names == frozenset({"Unknown School"})


class TestResolveName:
    def test_exact_match(self):
        target = {"Duke", "UConn", "Kansas"}
        assert resolve_name("Duke", target) == "Duke"

    def test_equivalent_match(self):
        target = {"Duke", "UConn", "Kansas"}
        assert resolve_name("Connecticut", target) == "UConn"

    def test_no_match_raises(self):
        target = {"Duke", "Kansas"}
        with pytest.raises(KeyError, match="Cannot resolve"):
            resolve_name("Totally Unknown", target)

    def test_works_with_dict_keys(self):
        target = {"Michigan State": 5.0, "Duke": 3.0}
        assert resolve_name("Michigan St.", target) == "Michigan State"

    def test_state_variant_resolution(self):
        target = {"Iowa State", "Duke"}
        assert resolve_name("Iowa St.", target) == "Iowa State"

    def test_reverse_resolution(self):
        target = {"Michigan St.", "Duke"}
        assert resolve_name("Michigan State", target) == "Michigan St."


class TestTryResolveName:
    def test_returns_match(self):
        target = {"Duke", "UConn"}
        assert try_resolve_name("Connecticut", target) == "UConn"

    def test_returns_original_on_no_match(self):
        target = {"Duke", "Kansas"}
        assert try_resolve_name("Unknown", target) == "Unknown"


class TestLegacyMappingsCovered:
    """Verify that all entries from the old CIX_NAME_CONVERSIONS are covered."""

    OLD_CIX_CONVERSIONS = {
        "Michigan State": "Michigan St.",
        "Southern California": "USC",
        "Middle Tennessee State": "Middle Tennessee",
        "Miami": "Miami FL",
        "Iowa State": "Iowa St.",
        "Kent State": "Kent St.",
        "Nevada Reno": "Nevada",
        "Virginia Commonwealth": "VCU",
        "California Davis": "UC Davis",
        "Wichita State": "Wichita St.",
        "Florida State": "Florida St.",
        "Alabma": "Alabama",
        "Abilene Chrsitian": "Abilene Christian",
        "Ohio University": "Ohio",
        "Brigham Young": "BYU",
        "Oregon State": "Oregon St.",
        "Oklahoma State": "Oklahoma St.",
        "NC State": "North Carolina St.",
    }

    @pytest.mark.parametrize(
        "source,target",
        list(OLD_CIX_CONVERSIONS.items()),
        ids=list(OLD_CIX_CONVERSIONS.keys()),
    )
    def test_old_conversion_covered(self, source, target):
        assert names_match(source, target), (
            f"Old CIX conversion {source!r} -> {target!r} is not covered "
            f"by equivalence classes"
        )
