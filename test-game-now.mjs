import { ConvexClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";

const client = new ConvexClient("https://exciting-warthog-431.convex.cloud");

async function testExistingGame() {
  console.log("🎮 Testing existing game with quick actions...\n");
  
  // Get available games
  const games = await client.query(api.games.getAvailableGames);
  console.log(`Found ${games.length} available games`);
  
  if (games.length === 0) {
    console.log("No games available, creating one...");
    
    // Create a 2-player game (minimum)
    const game = await client.mutation(api.games.createGame, {
      playerName: "TestPlayer1",
      anteAmount: 20,
      maxPlayers: 2
    });
    
    console.log(`✅ Game created: ${game.gameId}`);
    console.log(`🔗 View at: http://localhost:5175/game/${game.gameId}`);
    
    return;
  }
  
  // Join the first available game
  const gameToJoin = games[0];
  console.log(`Joining game: ${gameToJoin._id} (${gameToJoin.playerCount}/${gameToJoin.maxPlayers} players)`);
  
  try {
    const playerId = await client.mutation(api.games.joinGame, {
      gameId: gameToJoin._id,
      playerName: "QuickTester"
    });
    
    console.log(`✅ Joined as QuickTester (${playerId})`);
    console.log(`🔗 View at: http://localhost:5175/game/${gameToJoin._id}`);
    
    // Wait a moment for game to start/update
    await sleep(2000);
    
    // Test quick actions
    await testQuickActions(gameToJoin._id, playerId);
    
  } catch (e) {
    console.log(`❌ Failed to join: ${e.message}`);
    console.log(`🔗 View existing game at: http://localhost:5175/game/${gameToJoin._id}`);
  }
}

async function testQuickActions(gameId, playerId) {
  console.log("\n⚡ Testing quick actions...");
  
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Check for betting round
      const round = await client.query(api.actions.getCurrentBettingRound, { gameId });
      
      if (round) {
        console.log(`\n📍 Betting round active - Bet: $${round.betAmount}`);
        
        // Make a quick action (scissors = call)
        await client.mutation(api.actions.makeAction, {
          playerId: playerId,
          action: "scissors"
        });
        
        console.log("✅ Quick action taken: scissors (call)");
        
        // Wait for round to process
        await sleep(3000);
      } else {
        console.log("No betting round active, waiting...");
        await sleep(2000);
      }
      
      // Check game state
      const game = await client.query(api.games.getGame, { gameId });
      if (game) {
        console.log(`Game phase: ${game.currentPhase}, Pot: $${game.pot}`);
        
        if (game.currentPhase === "showdown") {
          console.log("🎯 Showdown phase - waiting for results...");
          await sleep(5000);
        }
        
        if (game.status === "finished") {
          console.log("🏁 Game finished!");
          break;
        }
      }
      
    } catch (e) {
      console.log(`❌ Action failed: ${e.message}`);
    }
    
    await sleep(1000);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testExistingGame().catch(console.error);