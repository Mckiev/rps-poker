import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

export const getSessionStandings = query({
  args: {},
  handler: async (ctx) => {
    const stats = await ctx.db
      .query("sessionStats")
      .withIndex("by_profit")
      .order("desc")
      .take(50); // Top 50 players

    return stats;
  },
});

export const updatePlayerStats = internalMutation({
  args: {
    playerName: v.string(),
    profitChange: v.number(), // Positive for profit, negative for loss
    gameFinished: v.optional(v.boolean()),
    handWon: v.optional(v.boolean()),
  },
  handler: async (ctx, { playerName, profitChange, gameFinished, handWon }) => {
    // Get existing stats or create new
    const existingStats = await ctx.db
      .query("sessionStats")
      .withIndex("by_name", (q) => q.eq("playerName", playerName))
      .first();

    if (existingStats) {
      // Update existing stats
      await ctx.db.patch(existingStats._id, {
        totalProfit: existingStats.totalProfit + profitChange,
        gamesPlayed: existingStats.gamesPlayed + (gameFinished ? 1 : 0),
        handsWon: existingStats.handsWon + (handWon ? 1 : 0),
        lastSeen: Date.now(),
      });
    } else {
      // Create new stats entry
      await ctx.db.insert("sessionStats", {
        playerName,
        totalProfit: profitChange,
        gamesPlayed: gameFinished ? 1 : 0,
        handsWon: handWon ? 1 : 0,
        lastSeen: Date.now(),
        createdAt: Date.now(),
      });
    }
  },
});

export const resetSessionStats = mutation({
  args: {},
  handler: async (ctx) => {
    // Delete all session stats
    const allStats = await ctx.db.query("sessionStats").collect();
    for (const stat of allStats) {
      await ctx.db.delete(stat._id);
    }
  },
});