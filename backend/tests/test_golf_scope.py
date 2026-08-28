from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import golf_scope
import match_settings


def test_classifies_mens_pga_major_as_in_scope():
    question = {
        "sport": "golf",
        "question": "Who won the 2019 Masters Tournament at Augusta National?",
        "league": "men's golf",
        "tags": [],
    }
    assert golf_scope.classify_golf_question(question) == golf_scope.MENS_PGA_SCOPE


def test_womens_golf_marker_overrides_pga_text():
    question = {
        "sport": "golf",
        "question": "Who won the Women's PGA Championship?",
        "tags": [],
    }
    assert golf_scope.classify_golf_question(question) == "excluded"


def test_liv_only_question_is_excluded_but_major_connection_is_kept():
    liv_only = {
        "sport": "golf",
        "question": "Who won the LIV Golf event in Adelaide?",
        "tags": [],
    }
    major_connection = {
        "sport": "golf",
        "question": "Which LIV Golf player won the Masters Tournament?",
        "tags": [],
    }
    assert golf_scope.classify_golf_question(liv_only) == "excluded"
    assert golf_scope.classify_golf_question(major_connection) == golf_scope.MENS_PGA_SCOPE


def test_generated_golf_rows_are_tagged_and_out_of_scope_rows_are_dropped():
    rows = golf_scope.scope_generated_rows(
        [
            {
                "sport": "golf",
                "question": "Which player won the Players Championship at TPC Sawgrass?",
                "tags": ["history"],
            },
            {
                "sport": "golf",
                "question": "Who won the Solheim Cup singles match?",
                "tags": [],
            },
        ]
    )
    assert len(rows) == 1
    assert rows[0]["golf_scope"] == golf_scope.MENS_PGA_SCOPE
    assert golf_scope.MENS_PGA_TAG in rows[0]["tags"]
    assert rows[0]["subcategory"] == golf_scope.MENS_PGA_SUBCATEGORY


def test_golf_match_filter_requires_mens_pga_scope_only_on_golf_branch():
    query = match_settings.MatchQuestionQuery(
        sports=["golf", "nfl"],
        difficulty="deepcut",
        count=5,
        era_filter="all",
    )
    match = match_settings.build_match_filter(query)
    golf_branch = match["$or"][0]
    nfl_branch = match["$or"][1]

    assert golf_branch["$and"][1]["$or"] == [
        {"golf_scope": golf_scope.MENS_PGA_SCOPE},
        {"tags": golf_scope.MENS_PGA_TAG},
    ]
    assert nfl_branch == {"$or": [{"sport": "nfl"}, {"category": "nfl"}]}
    assert match["difficulty"] == "deepcut"
