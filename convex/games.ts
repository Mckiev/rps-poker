import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Generate human-readable game names
function generateGameName(): string {
  const firstWords = [
    "Royal", "Golden", "Diamond", "Silver", "Crystal", "Emerald", "Ruby", "Sapphire",
    "Midnight", "Thunder", "Lightning", "Phoenix", "Dragon", "Eagle", "Wolf", "Tiger",
    "Ocean", "Mountain", "Desert", "Forest", "Cosmic", "Shadow", "Blazing", "Frozen"
  ];
  const secondWords = [
    "Table", "Arena", "Palace", "Casino", "Lounge", "Club", "Hall", "Throne",
    "Chamber", "Vault", "Tower", "Garden", "Ridge", "Peak", "Grove", "Haven",
    "Sanctuary", "Fortress", "Citadel", "Oasis", "Nexus", "Portal", "Realm", "Domain"
  ];
  
  const firstWord = firstWords[Math.floor(Math.random() * firstWords.length)];
  const secondWord = secondWords[Math.floor(Math.random() * secondWords.length)];
  
  return `${firstWord} ${secondWord}`;
}

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
      handNumber: 1,
      name: generateGameName(),
      createdAt: Date.now(),
    });

    const playerId = await ctx.db.insert("players", {
      gameId,
      name: playerName,
      balance: 1000, // Starting balance
      position: 0,
      holeCards: [],
      status: "active",
      lastSeen: Date.now(),
    });

    // Track session stats - starting with -$1000 buy-in
    await ctx.runMutation(internal.sessionStats.updatePlayerStats, {
      playerName,
      profitChange: -1000, // Buy-in cost
      gameFinished: false,
      handWon: false,
    });

    return { gameId, playerId };
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

    // Only include hole cards during showdown for security
    const playersWithCards = players.map(player => ({
      ...player,
      holeCards: game.currentPhase === "showdown" ? player.holeCards : []
    }));

    return { ...game, players: playersWithCards };
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
      communityCards: [
        deck[cardIndex++], deck[cardIndex++], deck[cardIndex++], // Flop (3 cards)
        deck[cardIndex++], deck[cardIndex++] // Turn (1 card) + River (1 card)
      ],
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
    const round = await ctx.db.get(roundId);
    if (!round || round.status !== "active") return;

    // Get all player actions for this round
    const actions = await ctx.db
      .query("playerActions")
      .withIndex("by_round", (q) => q.eq("bettingRoundId", roundId))
      .collect();

    // Get all active players
    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", round.gameId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Auto-fold players who didn't act (default to "paper" = fold)
    const playerActionsMap = new Map(actions.map(a => [a.playerId, a.action]));
    
    // Count rock actions to determine total bet amount
    let rockCount = 0;
    const playerBets = new Map<string, number>();
    
    for (const player of activePlayers) {
      const action = playerActionsMap.get(player._id) || "paper"; // Default to fold
      
      if (action === "rock") {
        rockCount++;
        playerBets.set(player._id, round.betAmount);
      } else if (action === "scissors" && rockCount > 0) {
        // Call the raises
        playerBets.set(player._id, round.betAmount * rockCount);
      } else if (action === "paper") {
        // Check if there are raises to call
        if (rockCount > 0) {
          // Fold - there are raises and player chooses paper
          await ctx.db.patch(player._id, { status: "folded" });
        }
        // If rockCount === 0, this is a "check" - player stays active with no bet
      }
    }

    // Process bets and update pot
    const game = await ctx.db.get(round.gameId);
    if (!game) return;

    let totalNewBets = 0;
    for (const [playerIdStr, betAmount] of playerBets) {
      const playerId = playerIdStr as Id<"players">;
      const player = await ctx.db.get(playerId);
      if (!player) continue;

      const actualBet = Math.min(betAmount, player.balance);
      const newBalance = player.balance - actualBet;
      
      await ctx.db.patch(playerId, { balance: newBalance });
      if (newBalance === 0) {
        await ctx.db.patch(playerId, { status: "out" });
      }
      
      totalNewBets += actualBet;
    }

    // Update pot
    const newPot = game.pot + totalNewBets;
    await ctx.db.patch(round.gameId, { pot: newPot });

    // Mark round as completed
    await ctx.db.patch(roundId, { status: "completed" });

    // Advance to next phase
    await ctx.scheduler.runAfter(0, internal.games.advanceGamePhase, { 
      gameId: round.gameId 
    });
  },
});

export const advanceGamePhase = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return;

    // Check if only one player remains active or not folded
    const allPlayers = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    
    const playersInHand = allPlayers.filter(p => p.status === "active" || p.status === "folded");
    const activePlayers = allPlayers.filter(p => p.status === "active");

    if (activePlayers.length <= 1 && playersInHand.length > 1) {
      // Hand over, award pot to remaining active player and start new hand
      if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        await ctx.db.patch(winner._id, { 
          balance: winner.balance + game.pot 
        });
        await ctx.db.patch(gameId, { lastHandWinner: winner.name });
        
        // Track session stats for hand win
        await ctx.runMutation(internal.sessionStats.updatePlayerStats, {
          playerName: winner.name,
          profitChange: game.pot, // Profit from winning the pot
          gameFinished: false,
          handWon: true,
        });
      }
      
      // Start new hand after 20 seconds to show hand results
      await ctx.scheduler.runAfter(20000, internal.games.startNewHand, { gameId });
      return;
    }
    
    // If we only have 1 player total (other is "out"), also end hand
    if (playersInHand.length <= 1) {
      if (playersInHand.length === 1) {
        const winner = playersInHand[0];
        await ctx.db.patch(winner._id, { 
          balance: winner.balance + game.pot 
        });
        await ctx.db.patch(gameId, { lastHandWinner: winner.name });
        
        // Track session stats for hand win
        await ctx.runMutation(internal.sessionStats.updatePlayerStats, {
          playerName: winner.name,
          profitChange: game.pot, // Profit from winning the pot
          gameFinished: false,
          handWon: true,
        });
      }
      
      // Start new hand after 20 seconds to show hand results
      await ctx.scheduler.runAfter(20000, internal.games.startNewHand, { gameId });
      return;
    }

    // Advance to next phase
    const phaseOrder: typeof game.currentPhase[] = ["preflop", "flop", "turn", "river", "showdown"];
    const currentIndex = phaseOrder.indexOf(game.currentPhase);
    
    if (currentIndex >= phaseOrder.length - 2) {
      // At river, advance to showdown
      await ctx.db.patch(gameId, { 
        currentPhase: "showdown",
        phaseStartTime: Date.now()
      });
      await ctx.scheduler.runAfter(0, internal.games.processShowdown, { gameId });
      return;
    }

    const nextPhase = phaseOrder[currentIndex + 1];
    await ctx.db.patch(gameId, { 
      currentPhase: nextPhase,
      phaseStartTime: Date.now()
    });

    // Start next betting round
    await ctx.scheduler.runAfter(0, internal.games.startBettingRound, { 
      gameId, 
      phase: nextPhase as any
    });
  },
});

export const processShowdown = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return;

    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    if (activePlayers.length === 0) return;

    // For now, award to first player (in real implementation, evaluate hands)
    const winner = activePlayers[0];
    await ctx.db.patch(winner._id, { 
      balance: winner.balance + game.pot 
    });

    await ctx.db.patch(gameId, { 
      lastHandWinner: winner.name,
      pot: 0
    });

    // Track session stats for hand win
    await ctx.runMutation(internal.sessionStats.updatePlayerStats, {
      playerName: winner.name,
      profitChange: game.pot, // Profit from winning the pot
      gameFinished: false,
      handWon: true,
    });

    // Start new hand after 20 seconds to allow players to see showdown results
    await ctx.scheduler.runAfter(20000, internal.games.startNewHand, { gameId });
  },
});

export const startNewHand = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return;

    // Get all players and check who can still play
    const allPlayers = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    // Filter players who have enough money for the ante
    const playersWithMoney = allPlayers.filter(player => player.balance >= game.anteAmount);

    // End game if less than 2 players can afford ante
    if (playersWithMoney.length < 2) {
      await ctx.db.patch(gameId, { 
        status: "finished",
        currentPhase: "showdown"
      });
      
      // Track final session stats for all players
      for (const player of allPlayers) {
        const finalProfitChange = player.balance; // Final balance represents their remaining money
        await ctx.runMutation(internal.sessionStats.updatePlayerStats, {
          playerName: player.name,
          profitChange: finalProfitChange, // Add final balance
          gameFinished: true,
          handWon: false,
        });
      }
      
      return;
    }

    // Reset all players to active status (except those who are out)
    for (const player of allPlayers) {
      if (player.balance >= game.anteAmount) {
        await ctx.db.patch(player._id, { 
          status: "active",
          holeCards: []
        });
      } else {
        await ctx.db.patch(player._id, { status: "out" });
      }
    }

    // Clear any active betting rounds
    const activeBettingRounds = await ctx.db
      .query("bettingRounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    
    for (const round of activeBettingRounds) {
      await ctx.db.patch(round._id, { status: "completed" });
    }

    // Start new hand
    const newHandNumber = (game.handNumber || 1) + 1;
    
    // Deal new hole cards
    const deck = shuffleDeck(createDeck());
    let cardIndex = 0;

    // Deal 2 cards to each active player
    for (const player of playersWithMoney) {
      const holeCards = [deck[cardIndex++], deck[cardIndex++]];
      await ctx.db.patch(player._id, { holeCards });
    }

    // Collect antes
    let totalPot = 0;
    for (const player of playersWithMoney) {
      const newBalance = Math.max(0, player.balance - game.anteAmount);
      const anteContribution = player.balance - newBalance;
      totalPot += anteContribution;
      
      await ctx.db.patch(player._id, { balance: newBalance });
      if (newBalance === 0) {
        await ctx.db.patch(player._id, { status: "out" });
      }
    }

    // Update game for new hand
    await ctx.db.patch(gameId, {
      handNumber: newHandNumber,
      currentPhase: "preflop",
      pot: totalPot,
      communityCards: [
        deck[cardIndex++], deck[cardIndex++], deck[cardIndex++], // Flop (3 cards)
        deck[cardIndex++], deck[cardIndex++] // Turn (1 card) + River (1 card)
      ],
      phaseStartTime: Date.now(),
      lastHandWinner: undefined,
    });

    // Start first betting round of new hand
    await ctx.scheduler.runAfter(0, internal.games.startBettingRound, { 
      gameId, 
      phase: "preflop" 
    });
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

export const deleteGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) {
      throw new Error("Game not found");
    }

    // Get all players in this game
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    // Only allow deletion if game has 1 or fewer players
    if (players.length > 1) {
      throw new Error("Cannot delete game with more than 1 player");
    }

    // Delete all players first
    for (const player of players) {
      await ctx.db.delete(player._id);
    }

    // Delete all betting rounds for this game
    const bettingRounds = await ctx.db
      .query("bettingRounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    
    for (const round of bettingRounds) {
      await ctx.db.delete(round._id);
    }

    // Delete all actions for this game
    const actions = await ctx.db
      .query("actions")
      .filter((q) => q.eq(q.field("gameId"), gameId))
      .collect();
    
    for (const action of actions) {
      await ctx.db.delete(action._id);
    }

    // Finally delete the game
    await ctx.db.delete(gameId);
  },
});

function shuffleDeck(deck: string[]): string[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}