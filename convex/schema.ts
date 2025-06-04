import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  games: defineTable({
    status: v.union(v.literal("waiting"), v.literal("playing"), v.literal("finished")),
    currentPhase: v.union(
      v.literal("ante"), 
      v.literal("preflop"), 
      v.literal("flop"), 
      v.literal("turn"), 
      v.literal("river"), 
      v.literal("showdown")
    ),
    pot: v.number(),
    communityCards: v.array(v.string()),
    phaseStartTime: v.optional(v.number()),
    phaseTimeoutScheduledId: v.optional(v.id("_scheduled_functions")),
    anteAmount: v.number(),
    maxPlayers: v.number(),
  }),

  players: defineTable({
    gameId: v.id("games"),
    name: v.string(),
    balance: v.number(),
    position: v.number(), // seat position 0-7
    holeCards: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("folded"), v.literal("out")),
    lastSeen: v.number(),
  }).index("by_game", ["gameId"]),

  bettingRounds: defineTable({
    gameId: v.id("games"),
    phase: v.union(
      v.literal("preflop"), 
      v.literal("flop"), 
      v.literal("turn"), 
      v.literal("river")
    ),
    betAmount: v.number(),
    startTime: v.number(),
    timeoutScheduledId: v.optional(v.id("_scheduled_functions")),
    status: v.union(v.literal("active"), v.literal("completed")),
  }).index("by_game", ["gameId"]),

  playerActions: defineTable({
    bettingRoundId: v.id("bettingRounds"),
    playerId: v.id("players"),
    action: v.union(v.literal("paper"), v.literal("scissors"), v.literal("rock")),
    timestamp: v.number(),
  }).index("by_round", ["bettingRoundId"]).index("by_player_round", ["playerId", "bettingRoundId"]),
});