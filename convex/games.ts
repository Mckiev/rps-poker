import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

export const createGame = mutation({
  args: {
    playerName: v.string(),
    anteAmount: v.optional(v.number()),
    maxPlayers: v.optional(v.number()),
  },
  handler: async (ctx, { playerName, anteAmount = 10, maxPlayers = 8 }) => {
    const gameId = await ctx.db.insert("games", {
      status: "waiting",
      currentPhase: "ante",
      pot: 0,
      communityCards: [],
      anteAmount,
      maxPlayers,
    });

    await ctx.db.insert("players", {
      gameId,
      name: playerName,
      balance: 1000, // Starting balance
      position: 0,
      holeCards: [],
      status: "active",
      lastSeen: Date.now(),
    });

    return gameId;
  },
});

export const joinGame = mutation({
  args: {
    gameId: v.id("games"),
    playerName: v.string(),
  },
  handler: async (ctx, { gameId, playerName }) => {
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "waiting") throw new Error("Game already started");

    const existingPlayers = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    if (existingPlayers.length >= game.maxPlayers) {
      throw new Error("Game is full");
    }

    // Check if name already taken
    if (existingPlayers.some(p => p.name === playerName)) {
      throw new Error("Name already taken");
    }

    const playerId = await ctx.db.insert("players", {
      gameId,
      name: playerName,
      balance: 1000,
      position: existingPlayers.length,
      holeCards: [],
      status: "active",
      lastSeen: Date.now(),
    });

    // Start game if we have at least 2 players
    if (existingPlayers.length >= 1) {
      await ctx.scheduler.runAfter(0, internal.games.startGame, { gameId });
    }

    return playerId;
  },
});

export const getGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    return { ...game, players };
  },
});

export const getAvailableGames = query({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db
      .query("games")
      .filter((q) => q.eq(q.field("status"), "waiting"))
      .collect();

    const gamesWithPlayerCount = await Promise.all(
      games.map(async (game) => {
        const playerCount = await ctx.db
          .query("players")
          .withIndex("by_game", (q) => q.eq("gameId", game._id))
          .collect()
          .then(players => players.length);
        
        return { ...game, playerCount };
      })
    );

    return gamesWithPlayerCount;
  },
});

export const startGame = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.status !== "waiting") return;

    // Deal hole cards to all players
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    if (players.length < 2) return;

    const deck = shuffleDeck(createDeck());
    let cardIndex = 0;

    // Deal 2 cards to each player
    for (const player of players) {
      const holeCards = [deck[cardIndex++], deck[cardIndex++]];
      await ctx.db.patch(player._id, { holeCards });
    }

    // Collect antes
    let totalPot = 0;
    for (const player of players) {
      const newBalance = Math.max(0, player.balance - game.anteAmount);
      const anteContribution = player.balance - newBalance;
      totalPot += anteContribution;
      
      await ctx.db.patch(player._id, { balance: newBalance });
      if (newBalance === 0) {
        await ctx.db.patch(player._id, { status: "out" });
      }
    }

    await ctx.db.patch(gameId, {
      status: "playing",
      currentPhase: "preflop",
      pot: totalPot,
      communityCards: [deck[cardIndex++], deck[cardIndex++], deck[cardIndex++]], // Flop ready
      phaseStartTime: Date.now(),
    });

    // Start first betting round
    await ctx.scheduler.runAfter(0, internal.games.startBettingRound, { 
      gameId, 
      phase: "preflop" 
    });
  },
});

export const startBettingRound = internalMutation({
  args: { 
    gameId: v.id("games"),
    phase: v.union(v.literal("preflop"), v.literal("flop"), v.literal("turn"), v.literal("river"))
  },
  handler: async (ctx, { gameId, phase }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return;

    const betAmount = Math.floor(game.pot / 2);

    const roundId = await ctx.db.insert("bettingRounds", {
      gameId,
      phase,
      betAmount,
      startTime: Date.now(),
      status: "active",
    });

    // Schedule timeout after 30 seconds
    const timeoutId = await ctx.scheduler.runAfter(
      30 * 1000, 
      internal.games.processBettingTimeout, 
      { roundId }
    );

    await ctx.db.patch(roundId, { timeoutScheduledId: timeoutId });
  },
});

export const processBettingTimeout = internalMutation({
  args: { roundId: v.id("bettingRounds") },
  handler: async (ctx, { roundId }) => {
    const round = await ctx.db.get(roundId);
    if (!round || round.status !== "active") return;

    await ctx.scheduler.runAfter(0, internal.games.completeBettingRound, { roundId });
  },
});

export const completeBettingRound = internalMutation({
  args: { roundId: v.id("bettingRounds") },
  handler: async (ctx, { roundId }) => {
    // Implementation for completing betting round and advancing game
    // This will be expanded in the next iteration
  },
});

function createDeck(): string[] {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const deck: string[] = [];
  
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(rank + suit);
    }
  }
  
  return deck;
}

function shuffleDeck(deck: string[]): string[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}