# Modulr.Core Architecture

## Purpose
Modulr.Core is the routing, naming, identity, and module registry layer of the Modulr network.

## Responsibilities
- verify signed messages
- register modules
- resolve module routes
- resolve names
- receive heartbeat updates

## Non-responsibilities
- storage logic
- asset balances
- payment logic
- inter-validator consensus

## Layers
- API layer
- Validation layer
- Service layer
- Repository layer
- Persistence layer