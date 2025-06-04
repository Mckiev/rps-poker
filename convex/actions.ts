import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

export const makeAction = mutation({
  args: {
    playerId: v.id("players"),
    action: v.union(v.literal("paper"), v.literal("scissors"), v.literal("rock")),
  },
  handler: async (ctx, { playerId, action }) => {
    const player = await ctx.db.get(playerId);
    if (!player) throw new Error("Player not found");

    // Find active betting round
    const activeRound = await ctx.db
      .query("bettingRounds")
      .withIndex("by_game", (q) => q.eq("gameId", player.gameId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (!activeRound) throw new Error("No active betting round");

    // Check if player already acted
    const existingAction = await ctx.db
      .query("playerActions")
      .withIndex("by_player_round", (q) => 
        q.eq("playerId", playerId).eq("bettingRoundId", activeRound._id)
      )
      .unique();

    if (existingAction) throw new Error("Player already acted this round");

    // Record the action
    await ctx.db.insert("playerActions", {
      bettingRoundId: activeRound._id,
      playerId,
      action,
      timestamp: Date.now(),
    });

    // Update player's last seen
    await ctx.db.patch(playerId, { lastSeen: Date.now() });

    // Check if all active players have acted
    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", player.gameId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const allActions = await ctx.db
      .query("playerActions")
      .withIndex("by_round", (q) => q.eq("bettingRoundId", activeRound._id))
      .collect();

    if (allActions.length >= activePlayers.length) {
      // All players acted, complete the round immediately
      await ctx.scheduler.runAfter(0, internal.games.completeBettingRound, { 
        roundId: activeRound._id 
      });
    }
  },
});

export const getCurrentBettingRound = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const activeRound = await ctx.db
      .query("bettingRounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (!activeRound) return null;

    const actions = await ctx.db
      .query("playerActions")
      .withIndex("by_round", (q) => q.eq("bettingRoundId", activeRound._id))
      .collect();

    const actionsWithPlayers = await Promise.all(
      actions.map(async (action) => {
        const player = await ctx.db.get(action.playerId);
        return { ...action, playerName: player?.name };
      })
    );

    return { ...activeRound, actions: actionsWithPlayers };
  },
});

export const getPlayerActions = query({
  args: { 
    playerId: v.id("players"),
    roundId: v.id("bettingRounds")
  },
  handler: async (ctx, { playerId, roundId }) => {
    return await ctx.db
      .query("playerActions")
      .withIndex("by_player_round", (q) => 
        q.eq("playerId", playerId).eq("bettingRoundId", roundId)
      )
      .unique();
  },
});