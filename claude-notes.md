# Claude Code Session Notes

## Current Step: Documentation and Planning (Step 1 Complete)
**Status**: Requirements gathered, now documenting and planning implementation

## App Requirements - Rock Paper Scissors Poker
**Game Type**: Online multiplayer poker variant with Rock-Paper-Scissors betting mechanics
**Core Features**:
- Texas Hold'em structure (hole cards + flop/turn/river)
- Simultaneous betting via Rock/Paper/Scissors choices
- 30-second timer per betting round (auto-fold if timeout)
- 2-8 players per game
- Real-time game state updates

**Game Rules**:
- Antes instead of blinds
- Paper = check/fold, Scissors = check/call, Rock = raise/call
- Raise amount = half current pot (rounded down)
- Multiple rocks = additive raises
- All showdown players reveal cards

## Session Progress
- ✅ Gathered requirements from user
- ✅ Clarified multiplayer approach (30s timer, async-friendly)
- 🔄 Documenting requirements and updating CLAUDE.md

## Instructions for Future Sessions
If starting fresh, reread the project:init-app command contents in CLAUDE.md to understand the initialization workflow.

## Commits Made This Session
(None yet)

## Next Steps
1. Remove template instructions from CLAUDE.md
2. Plan MVP technical implementation
3. Set up game state schema in Convex
4. Implement core game logic and UI