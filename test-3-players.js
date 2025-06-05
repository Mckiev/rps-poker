// Quick test script to create a 3-player game and simulate fast actions
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";

const client = new ConvexHttpClient("http://localhost:3210");

async function test3PlayerGame() {
  console.log("Creating 3-player game...");
  
  // Create game with Player1
  const game = await client.mutation(api.games.createGame, {
    playerName: "Player1",
    anteAmount: 10,
    maxPlayers: 3
  });
  
  console.log(`Game created: ${game.gameId}`);
  const player1Id = game.playerId;
  
  // Join with Player2
  const player2Id = await client.mutation(api.games.joinGame, {
    gameId: game.gameId,
    playerName: "Player2"
  });
  
  console.log("Player2 joined");
  
  // Join with Player3
  const player3Id = await client.mutation(api.games.joinGame, {
    gameId: game.gameId,
    playerName: "Player3"
  });
  
  console.log("Player3 joined - game should start!");
  
  // Wait a moment for game to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Get current betting round
  const round = await client.query(api.actions.getCurrentBettingRound, {
    gameId: game.gameId
  });
  
  if (round) {
    console.log("Betting round active, making quick actions...");
    
    // Player1 raises (rock)
    await client.mutation(api.actions.makeAction, {
      playerId: player1Id,
      action: "rock"
    });
    console.log("Player1: rock (raise)");
    
    // Player2 calls (scissors)
    await client.mutation(api.actions.makeAction, {
      playerId: player2Id,
      action: "scissors"
    });
    console.log("Player2: scissors (call)");
    
    // Player3 folds (paper)
    await client.mutation(api.actions.makeAction, {
      playerId: player3Id,
      action: "paper"
    });
    console.log("Player3: paper (fold)");
  }
  
  console.log(`\nOpen game at: http://localhost:5175/game/${game.gameId}`);
  console.log(`Player1 ID for localStorage: ${player1Id}`);
}

test3PlayerGame().catch(console.error);