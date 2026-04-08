"""Data access for Modulr.Core MVP tables."""

from modulr_core.repositories.core_genesis import CoreGenesisRepository
from modulr_core.repositories.dial_route_entry import DialRouteEntryRepository
from modulr_core.repositories.genesis_challenge import GenesisChallengeRepository
from modulr_core.repositories.heartbeat import HeartbeatRepository
from modulr_core.repositories.message_dedup import MessageDedupRepository
from modulr_core.repositories.modules import ModulesRepository
from modulr_core.repositories.name_bindings import NameBindingsRepository

__all__ = [
    "CoreGenesisRepository",
    "DialRouteEntryRepository",
    "GenesisChallengeRepository",
    "HeartbeatRepository",
    "MessageDedupRepository",
    "ModulesRepository",
    "NameBindingsRepository",
]
