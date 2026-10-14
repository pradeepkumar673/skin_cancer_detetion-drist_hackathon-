"""Clinical team arbitration engine.

Implements Step 15 arbitration:
1. Prioritizes primary team by clinical urgency (urgent_visit > routine_visit > monitor),
   breaking ties by domain nurse confidence score.
2. If no nurse fired, designates primary team as 'none'.
3. Retains and reports all secondary active teams without hiding results.
4. Generates transparent arbitration notes explaining prioritization rationale.

Adheres to Project Rules:
- Rule 1: No synthetic numbers or arbitrary overrides.
- Rule 10: Decision support only.
"""

from typing import Any, Dict, List, Optional
from app.schemas import ArbitrationResult

URGENCY_RANKS = {
    "urgent_visit": 3,
    "routine_visit": 2,
    "monitor": 1,
}


def arbitrate_teams(
    nurse_activations: Dict[str, Dict[str, Any]],
    team_urgencies: Dict[str, Optional[str]],
) -> ArbitrationResult:
    """Select primary and secondary clinical teams based on urgency and nurse relevance."""
    relevant_teams = [
        team for team, act in nurse_activations.items() if act.get("relevant", False)
    ]

    if not relevant_teams:
        return ArbitrationResult(
            primary_team="none",
            secondary_teams=[],
            notes=[
                "Visual features do not match known dermatological lesions, ulcers, or conditions with sufficient clinical confidence."
            ],
        )

    # Rank relevant teams: primary key urgency, secondary key nurse score
    def team_rank(t: str) -> tuple:
        urgency = team_urgencies.get(t) or "routine_visit"
        urgency_weight = URGENCY_RANKS.get(urgency, 1)
        nurse_score = float(nurse_activations.get(t, {}).get("score", 0.0))
        return (urgency_weight, nurse_score)

    sorted_teams = sorted(relevant_teams, key=team_rank, reverse=True)
    primary = sorted_teams[0]
    secondary = sorted_teams[1:]

    primary_urgency = team_urgencies.get(primary) or "routine_visit"
    primary_score = float(nurse_activations.get(primary, {}).get("score", 0.0))

    notes = [
        f"Primary team '{primary}' designated based on clinical urgency ('{primary_urgency}') and nurse score ({primary_score:.2f})."
    ]
    if secondary:
        notes.append(
            f"Secondary active evaluations provided concurrently for: {', '.join(secondary)}."
        )

    return ArbitrationResult(
        primary_team=primary,
        secondary_teams=secondary,
        notes=notes,
    )
