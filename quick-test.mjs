import { ConvexClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";

const client = new ConvexClient("https://exciting-warthog-431.convex.cloud");

async function playGame() {
  console.log("🎮 Starting 3-player RPS Poker test...\n");
  
  // Create game with Player1
  const game = await client.mutation(api.games.createGame, {
    playerName: "Alice",
    anteAmount: 20,
    maxPlayers: 3
  });
  
  console.log(`✅ Game created: ${game.gameId}`);
  console.log(`   Alice joined with $${1000 - 20} (paid $20 ante)`);
  
  const gameId = game.gameId;
  const aliceId = game.playerId;
  
  // Join with Player2
  const bobId = await client.mutation(api.games.joinGame, {
    gameId: gameId,
    playerName: "Bob"
  });
  console.log(`✅ Bob joined`);
  
  // Join with Player3 - this starts the game
  const charlieId = await client.mutation(api.games.joinGame, {
    gameId: gameId,
    playerName: "Charlie"
  });
  console.log(`✅ Charlie joined - Game started!\n`);
  
  // Play multiple hands
  for (let hand = 1; hand <= 3; hand++) {
    console.log(`\n🃏 HAND ${hand} STARTING...`);
    
    // Wait for game to deal cards
    await sleep(1000);
    
    // Get game state
    let gameState = await client.query(api.games.getGame, { gameId });
    console.log(`Phase: ${gameState.currentPhase}, Pot: $${gameState.pot}`);
    
    // Play through all betting rounds
    const phases = ["preflop", "flop", "turn", "river"];
    
    for (const expectedPhase of phases) {
      // Get current betting round
      const round = await client.query(api.actions.getCurrentBettingRound, { gameId });
      
      if (!round) {
        console.log("No betting round active");
        break;
      }
      
      console.log(`\n📍 ${expectedPhase.toUpperCase()} - Pot: $${gameState.pot}`);
      
      // Quick actions
      const actions = [
        { player: "Alice", id: aliceId, action: "rock" },     // raise
        { player: "Bob", id: bobId, action: "scissors" },     // call
        { player: "Charlie", id: charlieId, action: hand === 1 ? "paper" : "scissors" } // fold first hand, call others
      ];
      
      for (const { player, id, action } of actions) {
        try {
          await client.mutation(api.actions.makeAction, {
            playerId: id,
            action: action
          });
          console.log(`   ${player}: ${action} ${action === "rock" ? "(raise)" : action === "scissors" ? "(call)" : "(fold)"}`);
        } catch (e) {
          // Player might be folded
          console.log(`   ${player}: already folded or not active`);
        }
      }
      
      // Wait for round to process
      await sleep(2000);
      
      // Get updated game state
      gameState = await client.query(api.games.getGame, { gameId });
      
      // Show community cards if visible
      if (gameState.currentPhase === "flop" && expectedPhase === "preflop") {
        console.log(`   Community: ${gameState.communityCards.slice(0, 3).join(" ")}`);
      } else if (gameState.currentPhase === "turn" && expectedPhase === "flop") {
        console.log(`   Turn: ${gameState.communityCards[3]}`);
      } else if (gameState.currentPhase === "river" && expectedPhase === "turn") {
        console.log(`   River: ${gameState.communityCards[4]}`);
      }
    }
    
    // Wait for showdown
    console.log("\n🎯 SHOWDOWN");
    await sleep(5000);
    
    // Check final state
    gameState = await client.query(api.games.getGame, { gameId });
    
    // Show player balances
    console.log("\n💰 Balances:");
    for (const player of gameState.players) {
      console.log(`   ${player.name}: $${player.balance} ${player.status === "folded" ? "(folded)" : ""}`);
    }
    
    if (gameState.lastHandWinner) {
      console.log(`\n🏆 Winner: ${gameState.lastHandWinner}!`);
    }
    
    // Check if game continues
    if (gameState.status === "finished") {
      console.log("\n🏁 GAME OVER - Not enough players can afford ante");
      break;
    }
    
    // Wait before next hand
    await sleep(3000);
  }
  
  console.log(`\n📊 Final Results:`);
  gameState = await client.query(api.games.getGame, { gameId });
  for (const player of gameState.players) {
    console.log(`   ${player.name}: $${player.balance}`);
  }
  
  console.log(`\n🔗 View game at: http://localhost:5175/game/${gameId}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

playGame().catch(console.error);