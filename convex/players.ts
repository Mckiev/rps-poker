import { v } from "convex/values";
import { query } from "./_generated/server";

export const getCurrentPlayer = query({
  args: { 
    gameId: v.id("games"),
    playerId: v.id("players")
  },
  handler: async (ctx, { gameId, playerId }) => {
    const player = await ctx.db.get(playerId);
    if (!player || player.gameId !== gameId) {
      return null;
    }
    return player;
  },
});

export const getPlayerHoleCards = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (!player) return null;
    
    // Only return hole cards for the requesting player
    return {
      playerId: player._id,
      holeCards: player.holeCards,
      name: player.name
    };
  },
});