from __future__ import annotations

from typing import Any, Callable, Mapping, Optional, TypeVar

from seenrelay import ObservationFactory, ReusePolicy, SeenRelayClient, ValidationContext

T = TypeVar("T")
Validator = Callable[[ValidationContext], T]


def protect_validation(
    client: SeenRelayClient,
    *,
    fact: Mapping[str, Any],
    validate: Validator[T],
    reuse: Optional[ReusePolicy[T]] = None,
    max_age_seconds: Optional[int] = None,
    observation: Optional[ObservationFactory[T]] = None,
) -> Callable[[T], T]:
    """Bind SeenRelay around one existing validator.

    Without an explicit reuse policy this remains strict shadow mode: CHECK runs,
    the original validation still runs, and the independently obtained result is
    OBSERVEd best-effort. The returned callable accepts only the caller's known
    value, making each later protected revalidation a one-line call.
    """

    def protected(known_value: T) -> T:
        return client.guard(
            fact=fact,
            known_value=known_value,
            validate=validate,
            reuse=reuse,
            max_age_seconds=max_age_seconds,
            observation=observation,
        )

    return protected
