import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Clock, Users, Home, RotateCcw, Trophy, TrendingUp, TrendingDown } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { api } from "../../convex/_generated/api";

// Simple audio feedback system
const playSound = (type: 'select' | 'submit' | 'success' | 'error' | 'timer' | 'newhand') => {
  // Create audio context if needed
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  const createBeep = (frequency: number, duration: number) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  };
  
  switch (type) {
    case 'select':
      createBeep(800, 0.1);
      break;
    case 'submit':
      createBeep(600, 0.2);
      setTimeout(() => createBeep(800, 0.2), 100);
      break;
    case 'success':
      createBeep(800, 0.1);
      setTimeout(() => createBeep(1000, 0.1), 100);
      setTimeout(() => createBeep(1200, 0.1), 200);
      break;
    case 'error':
      createBeep(300, 0.3);
      break;
    case 'timer':
      createBeep(1000, 0.1);
      break;
    case 'newhand':
      createBeep(500, 0.1);
      setTimeout(() => createBeep(700, 0.1), 150);
      break;
  }
};

export const Route = createFileRoute("/game/$gameId")({
  loader: async ({ context: { queryClient }, params: { gameId } }) => {
    if (!gameId) throw new Error("Game ID is required");
    const gameQueryOptions = convexQuery(api.games.getGame, { gameId: gameId as any });
    const sessionStandingsQueryOptions = convexQuery(api.sessionStats.getSessionStandings, {});
    await Promise.all([
      queryClient.ensureQueryData(gameQueryOptions),
      queryClient.ensureQueryData(sessionStandingsQueryOptions),
    ]);
  },
  component: GamePage,
});

function GamePage() {
  const { gameId } = Route.useParams();
  const gameQueryOptions = convexQuery(api.games.getGame, { gameId: gameId as any });
  const { data: gameData } = useSuspenseQuery(gameQueryOptions);
  
  if (!gameData) {
    return <div className="text-center p-8">Game not found</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-2">
      <PokerTable game={gameData} />
    </div>
  );
}

function PokerTable({ game }: { game: any }) {
  const navigate = useNavigate();
  const currentPlayerId = localStorage.getItem(`player-${game._id}`);
  const playerName = localStorage.getItem("rps-poker-nickname") || "Player";
  
  const currentRoundQuery = convexQuery(api.actions.getCurrentBettingRound, { 
    gameId: game._id
  });
  const { data: currentRound } = useSuspenseQuery(currentRoundQuery);

  const playerCardsQuery = convexQuery(api.players.getPlayerHoleCards, { 
    playerId: currentPlayerId as any
  });
  const { data: playerCards } = useSuspenseQuery(playerCardsQuery);

  const createGame = useMutation(api.games.createGame);
  const leaveGame = useMutation(api.games.leaveGame);

  const handlePlayAgain = async () => {
    try {
      const result = await createGame({ 
        playerName, 
        anteAmount: game.anteAmount, 
        maxPlayers: game.maxPlayers 
      });
      localStorage.setItem(`player-${result.gameId}`, result.playerId);
      void navigate({ to: `/game/${result.gameId}` });
    } catch (error) {
      console.error("Failed to create new game:", error);
    }
  };

  const handleReturnToLobby = () => {
    void navigate({ to: "/" });
  };

  const handleLeaveTable = async () => {
    if (!currentPlayerId) return;
    
    try {
      await leaveGame({ 
        gameId: game._id as any, 
        playerId: currentPlayerId as any 
      });
      void navigate({ to: "/" });
    } catch (error) {
      console.error("Failed to leave table:", error);
      // Still navigate to lobby even if leave fails
      void navigate({ to: "/" });
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Game Header */}
      <div className="text-center mb-3">
        <div className="flex justify-between items-center mb-2">
          {currentPlayerId ? (
            <button 
              className="btn btn-ghost text-white hover:bg-red-600 hover:text-white"
              onClick={handleLeaveTable}
            >
              <Home className="w-4 h-4" />
              Leave Table
            </button>
          ) : (
            <button 
              className="btn btn-ghost text-white"
              onClick={handleReturnToLobby}
            >
              <Home className="w-4 h-4" />
              Lobby
            </button>
          )}
          
          <h1 className="text-lg font-bold text-white">
            {game.name || `Game ${game._id.slice(-6)}`} - Hand #{game.handNumber || 1} - {game.currentPhase.toUpperCase()}
          </h1>
          
          {game.status === "finished" && (
            <button 
              className="btn btn-primary"
              onClick={() => void handlePlayAgain()}
            >
              <RotateCcw className="w-4 h-4" />
              Play Again
            </button>
          )}
          {game.status !== "finished" && <div className="w-24"></div>}
        </div>
        
        <div className="flex justify-center items-center gap-4 text-white">
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span className="text-sm">Ante: ${game.anteAmount} • Max Players: {game.maxPlayers}</span>
          </div>
        </div>
      </div>

      {/* Main Poker Table */}
      <div className="relative">
        {/* Poker Table Background */}
        <div className="w-full h-80 bg-gradient-to-br from-green-900 to-green-700 rounded-full border-4 border-gray-600 shadow-2xl relative overflow-hidden">
          {/* Table Felt Pattern */}
          <div className="absolute inset-3 bg-gradient-to-br from-green-800 to-green-600 rounded-full border-2 border-green-500 shadow-inner">
            
            {/* Community Cards Area */}
            <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <div className="text-center mb-3">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <h3 className="text-white font-medium text-sm">Community Cards</h3>
                  {game.status === "playing" && (
                    <div className={`text-xs px-2 py-1 rounded-full ${
                      game.currentPhase === "preflop" ? "bg-blue-600 text-white" :
                      game.currentPhase === "flop" ? "bg-green-600 text-white" :
                      game.currentPhase === "turn" ? "bg-yellow-600 text-black" :
                      game.currentPhase === "river" ? "bg-orange-600 text-white" :
                      "bg-purple-600 text-white"
                    }`}>
                      {game.currentPhase.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 justify-center">
                  {game.status === "playing" && (() => {
                    const cardsToShow = 
                      game.currentPhase === "preflop" ? 0 :
                      game.currentPhase === "flop" ? 3 :
                      game.currentPhase === "turn" ? 4 :
                      game.currentPhase === "river" || game.currentPhase === "showdown" ? 5 : 0;
                    
                    // Show revealed community cards with animation
                    const revealedCards = game.communityCards.slice(0, cardsToShow);
                    // Show hidden placeholder cards
                    const hiddenCards = Array.from({ length: Math.max(0, 5 - cardsToShow) });
                    
                    return (
                      <>
                        {revealedCards.map((card: string, i: number) => (
                          <div key={i} className="transform transition-all duration-500 hover:scale-110">
                            <PlayingCard card={card} size="medium" />
                          </div>
                        ))}
                        {hiddenCards.map((_, i) => (
                          <div key={`hidden-${i}`} className="opacity-60">
                            <PlayingCard card="back" size="medium" />
                          </div>
                        ))}
                      </>
                    );
                  })()}
                  
                  {/* Waiting state */}
                  {game.status === "waiting" && (
                    <div className="flex gap-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="opacity-30">
                          <PlayingCard card="back" size="medium" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pot Display with Chip Visualization - Much more prominent */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <div className="flex flex-col items-center">
                {/* Chip Stack Visualization - Bigger */}
                <div className="relative mb-3 h-10">
                  {/* Create stacked chips based on pot size */}
                  {Array.from({ length: Math.min(Math.floor(game.pot / 10) + 1, 8) }).map((_, i) => (
                    <div
                      key={i}
                      className={`absolute w-12 h-3 rounded-full shadow-lg transition-all duration-500 hover:scale-110 ${
                        i % 3 === 0 ? 'bg-gradient-to-b from-yellow-400 to-yellow-600 border border-yellow-300' :
                        i % 3 === 1 ? 'bg-gradient-to-b from-red-400 to-red-600 border border-red-300' :
                        'bg-gradient-to-b from-blue-400 to-blue-600 border border-blue-300'
                      }`}
                      style={{
                        bottom: `${i * 2.5}px`,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 10 - i,
                        animationDelay: `${i * 100}ms`
                      }}
                    />
                  ))}
                  
                  {/* Glowing effect for big pots */}
                  {game.pot >= 50 && (
                    <div className="absolute inset-0 bg-yellow-400/30 rounded-full blur-md animate-pulse" />
                  )}
                </div>
                
                {/* Pot Amount Label - Much larger and more prominent */}
                <div className={`px-6 py-3 rounded-full font-bold text-xl shadow-xl border-2 transition-all duration-300 ${
                  game.pot >= 500 ? 'bg-gradient-to-r from-orange-400 to-red-500 text-white border-orange-300 animate-pulse scale-110' :
                  game.pot >= 100 ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black border-yellow-300 scale-105' :
                  'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black border-yellow-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg ${game.pot >= 500 ? 'text-yellow-200' : 'text-yellow-900'}`}>
                      {game.pot >= 500 ? '🔥' : game.pot >= 100 ? '💎' : '💰'}
                    </span>
                    <span className="font-black">POT: ${game.pot.toLocaleString()}</span>
                  </div>
                </div>
                
                {/* Pot Growth Animation */}
                {game.pot > 0 && (
                  <div className="mt-2 text-sm text-yellow-200 opacity-90 font-semibold">
                    {game.pot >= 500 ? 'MASSIVE POT! 🔥' :
                     game.pot >= 100 ? 'Big Pot! 💎' :
                     'Total Prize Pool'}
                  </div>
                )}
              </div>
            </div>

            {/* Players positioned around the table */}
            <PlayersAroundTable 
              players={game.players} 
              currentPlayerId={currentPlayerId}
              gamePhase={game.currentPhase}
            />
          </div>
        </div>
      </div>


      {/* Player's Hole Cards - Only show during active play, not showdown */}
      {playerCards && game.currentPhase !== "showdown" && (
        <div className="mt-3 text-center">
          <h3 className="text-white font-medium text-sm mb-2">Your Cards</h3>
          <div className="flex gap-2 justify-center">
            {playerCards.holeCards.map((card: string, i: number) => (
              <PlayingCard key={i} card={card} size="large" />
            ))}
          </div>
        </div>
      )}

      {/* Betting Interface */}
      {currentRound && game.status === "playing" && currentPlayerId && (
        <div className="mt-3">
          <BettingInterface 
            round={currentRound} 
            playerId={currentPlayerId}
          />
        </div>
      )}

      {/* Phase Transition Indicator */}
      {game.status === "playing" && game.currentPhase === "showdown" && (
        <div className="mt-3 mb-4">
          <div className="bg-gradient-to-r from-purple-900/80 to-purple-800/80 backdrop-blur-sm rounded-lg p-4 max-w-2xl mx-auto border border-purple-500/50">
            <div className="text-center">
              <h3 className="text-lg font-bold text-purple-300 mb-2">🃏 SHOWDOWN</h3>
              <p className="text-purple-200 text-sm">Players reveal their hands - best poker hand wins!</p>
              {game.lastHandWinner && (
                <div className="mt-2 p-2 bg-yellow-500/20 rounded-lg border border-yellow-500/30">
                  <p className="text-yellow-300 font-semibold">{game.lastHandWinner}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phase Progress Indicator */}
      {game.status === "playing" && game.currentPhase !== "showdown" && (
        <div className="mt-3 mb-4">
          <div className="max-w-xl mx-auto">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-400">Phase Progress</span>
              <span className="text-xs text-gray-400 capitalize">{game.currentPhase}</span>
            </div>
            <div className="flex gap-1">
              {["preflop", "flop", "turn", "river", "showdown"].map((phase, index) => (
                <div
                  key={phase}
                  className={`flex-1 h-2 rounded ${
                    phase === game.currentPhase
                      ? "bg-gradient-to-r from-yellow-500 to-yellow-600 animate-pulse"
                      : index < ["preflop", "flop", "turn", "river", "showdown"].indexOf(game.currentPhase)
                      ? "bg-green-600"
                      : "bg-gray-700"
                  }`}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Pre-flop</span>
              <span>Flop</span>
              <span>Turn</span>
              <span>River</span>
              <span>Showdown</span>
            </div>
          </div>
        </div>
      )}

      {/* Game Status */}
      <div className="mt-3 text-center">
        {game.status === "finished" ? (
          <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 max-w-md mx-auto border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-3">🎉 Final Results</h2>
            
            {/* Final Winner Display */}
            {(() => {
              const winner = game.players.find((p: any) => p.balance >= game.anteAmount);
              return winner ? (
                <div className="mb-4">
                  <p className="text-white text-lg">
                    Tournament Winner: <span className="font-bold text-yellow-400">{winner.name}</span>
                  </p>
                  <p className="text-gray-300">
                    Final Balance: <span className="text-green-400">${winner.balance}</span>
                  </p>
                  <p className="text-gray-300 text-sm">
                    Hands Played: {game.handNumber || 1}
                  </p>
                </div>
              ) : (
                <p className="text-white mb-4">All players eliminated</p>
              );
            })()}
            
            <div className="flex gap-3 justify-center">
              <button 
                className="btn btn-primary"
                onClick={() => void handlePlayAgain()}
              >
                <RotateCcw className="w-4 h-4" />
                New Tournament
              </button>
              <button 
                className="btn btn-ghost text-white"
                onClick={handleReturnToLobby}
              >
                <Home className="w-4 h-4" />
                Back to Lobby
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Hand Winner Notification */}
            {game.lastHandWinner && (
              <div className="bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 border border-yellow-500/50 rounded-lg p-2 mb-3 max-w-sm mx-auto">
                <p className="text-yellow-300 font-medium text-sm">
                  🏆 Last Hand: {game.lastHandWinner}
                </p>
              </div>
            )}
            
            {/* Waiting for Players State */}
            {game.status === "waiting" && (
              <div className="bg-gradient-to-r from-blue-900/80 to-blue-800/80 backdrop-blur-sm rounded-lg p-4 max-w-md mx-auto border border-blue-500/50 mb-3">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
                    <h3 className="text-blue-300 font-semibold">Waiting for Players</h3>
                  </div>
                  <p className="text-blue-200 text-sm mb-2">
                    {game.players?.length || 0} / {game.maxPlayers} players joined
                  </p>
                  <div className="flex justify-center mb-2">
                    <div className="flex gap-1">
                      {Array.from({ length: game.maxPlayers }).map((_, i) => (
                        <div 
                          key={i} 
                          className={`w-3 h-3 rounded-full ${
                            i < (game.players?.length || 0) ? 'bg-blue-400' : 'bg-gray-600'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-blue-300 text-xs">
                    {(game.players?.length || 0) >= 2 
                      ? "Game will start in 10 seconds or when full"
                      : "Need at least 2 players to start"
                    }
                  </p>
                </div>
              </div>
            )}
            
            {/* Playing State */}
            {game.status === "playing" && (
              <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-medium bg-gradient-to-r from-green-600 to-green-700 text-white shadow-lg`}>
                Hand #{game.handNumber || 1} - {game.currentPhase.toUpperCase()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Session Standings */}
      <div className="mt-6">
        <SessionStandings />
      </div>
    </div>
  );
}

function PlayingCard({ card, size = "normal" }: { card: string; size?: "normal" | "large" | "small" | "medium" }) {
  const isBack = card === "back";
  
  // Bigger card sizes overall
  const sizeClasses = 
    size === "large" ? "w-18 h-24" : 
    size === "medium" ? "w-16 h-22" :
    size === "small" ? "w-12 h-16" : 
    "w-14 h-20";
  
  // 4-color deck: Hearts=red, Diamonds=blue, Clubs=green, Spades=black
  const getCardColor = (card: string) => {
    if (card.includes('♥')) return 'text-red-600';  // Hearts - Red
    if (card.includes('♦')) return 'text-blue-600'; // Diamonds - Blue  
    if (card.includes('♣')) return 'text-green-600'; // Clubs - Green
    if (card.includes('♠')) return 'text-black';     // Spades - Black
    return 'text-black';
  };
  
  return (
    <div className={`${sizeClasses} bg-white rounded-lg border border-gray-400 shadow-lg flex items-center justify-center relative overflow-hidden`}>
      {isBack ? (
        <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
          <div className="text-white text-lg font-bold">♠</div>
        </div>
      ) : (
        <div className="text-center">
          <div className={`font-bold ${getCardColor(card)}`}>
            <div className={size === "small" ? "text-sm" : size === "medium" ? "text-base" : "text-lg"}>{card[0]}</div>
            <div className={`leading-none ${size === "small" ? "text-sm" : size === "medium" ? "text-lg" : "text-2xl"}`}>{card[1]}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayersAroundTable({ players, currentPlayerId, gamePhase }: { players: any[]; currentPlayerId: string | null; gamePhase: string }) {
  // Rearrange players so current player is always at bottom center
  const currentPlayerIndex = players.findIndex(p => p._id === currentPlayerId);
  const arrangedPlayers = currentPlayerIndex >= 0 
    ? [
        ...players.slice(currentPlayerIndex), // Current player first
        ...players.slice(0, currentPlayerIndex) // Then others
      ]
    : players;

  // Calculate positions around the table with current player at bottom
  const getPlayerPosition = (arrangedIndex: number, total: number) => {
    if (arrangedIndex === 0 && currentPlayerIndex >= 0) {
      // Current player always at bottom center, with more space due to taller table
      return { x: 50, y: 88 };
    }
    
    // Other players positioned around the top half of the table
    const otherPlayerIndex = arrangedIndex - 1;
    const totalOthers = total - 1;
    
    if (totalOthers === 1) {
      // One opponent at top center
      return { x: 50, y: 15 };
    } else if (totalOthers === 2) {
      // Two opponents: top-left and top-right
      return otherPlayerIndex === 0 
        ? { x: 25, y: 15 } 
        : { x: 75, y: 15 };
    } else {
      // Multiple opponents spread across top arc
      const angle = (otherPlayerIndex * 180) / (totalOthers - 1) - 90; // -90 to 90 degrees (top arc)
      const radiusX = 40;
      const radiusY = 25;
      const x = 50 + radiusX * Math.cos((angle * Math.PI) / 180);
      const y = 20 + radiusY * Math.sin((angle * Math.PI) / 180);
      return { x, y };
    }
  };

  return (
    <>
      {arrangedPlayers.map((player, arrangedIndex) => {
        const position = getPlayerPosition(arrangedIndex, arrangedPlayers.length);
        const isCurrentPlayer = player._id === currentPlayerId;
        
        return (
          <div
            key={player._id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
          >
            <PlayerSeat 
              player={player} 
              isCurrentPlayer={isCurrentPlayer}
              gamePhase={gamePhase}
            />
          </div>
        );
      })}
    </>
  );
}

function PlayerSeat({ player, isCurrentPlayer, gamePhase }: { player: any; isCurrentPlayer: boolean; gamePhase: string }) {
  const showCards = gamePhase === "showdown" && player.holeCards && player.holeCards.length > 0;
  
  return (
    <div className={`text-center ${isCurrentPlayer ? 'scale-110' : ''}`}>
      {/* Hole Cards - Show during showdown */}
      {showCards && (
        <div className="mb-2">
          <div className="flex gap-1 justify-center mb-1">
            {player.holeCards.map((card: string, i: number) => (
              <PlayingCard key={i} card={card} size="medium" />
            ))}
          </div>
          {/* Show hand strength if available */}
          {player.handName && (
            <div className="text-xs bg-gray-900/80 text-yellow-300 px-2 py-1 rounded-full border border-yellow-500/30">
              {player.handName}
            </div>
          )}
        </div>
      )}
      
      {/* Player Name & Status */}
      <div className={`px-3 py-1 rounded-full text-xs font-semibold mb-1 ${
        isCurrentPlayer ? 'bg-yellow-400 text-black' :
        player.status === "active" ? 'bg-green-600 text-white' :
        player.status === "folded" ? 'bg-red-600 text-white' :
        'bg-gray-600 text-white'
      }`}>
        {player.name}
        {player.status === "folded" && gamePhase === "showdown" && " (Folded)"}
      </div>
      
      {/* Chip Stack - More prominent like real poker */}
      <div className="relative">
        {/* Chip Stack Visual */}
        <div className="flex flex-col items-center">
          {/* Stack of chips visualization */}
          <div className="relative">
            <div className="w-8 h-2 bg-yellow-400 rounded-full shadow-sm"></div>
            <div className="w-8 h-2 bg-yellow-300 rounded-full shadow-sm -mt-1"></div>
            <div className="w-8 h-2 bg-yellow-200 rounded-full shadow-sm -mt-1"></div>
          </div>
          {/* Balance amount */}
          <div className="bg-black/80 text-yellow-400 px-2 py-0.5 rounded text-xs font-mono font-bold mt-1 shadow-lg">
            ${player.balance.toLocaleString()}
          </div>
        </div>
      </div>
      
      {/* Action indicator for current turn */}
      {player.status === "active" && (
        <div className="mt-1 w-2 h-2 rounded-full mx-auto bg-green-400 animate-pulse" />
      )}
    </div>
  );
}

function BettingInterface({ round, playerId }: { round: any; playerId: string }) {
  const [selectedAction, setSelectedAction] = useState<"paper" | "scissors" | "rock" | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const makeAction = useMutation(api.actions.makeAction);
  
  // Check if player has already submitted an action for this round
  const playerHasActed = round.actions.some((action: any) => action.playerId === playerId);
  
  const handleSubmitAction = useCallback(async () => {
    if (!selectedAction || isSubmitting || playerHasActed) return;
    
    setIsSubmitting(true);
    
    // Play submit sound
    playSound('submit');
    
    try {
      await makeAction({ 
        playerId: playerId as any, 
        action: selectedAction 
      });
      setIsSubmitted(true);
      playSound('success');
    } catch (error) {
      console.error("Failed to submit action:", error);
      setIsSubmitting(false);
      playSound('error');
    }
  }, [selectedAction, playerId, makeAction, isSubmitting, playerHasActed]);
  
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - round.startTime) / 1000);
      const remaining = Math.max(0, 30 - elapsed);
      setTimeLeft(remaining);
      
      // Play warning sounds
      if (remaining === 10 || remaining === 5) {
        playSound('timer');
      }
      
      // Auto-submit if time runs out and action is selected but not submitted
      if (remaining === 0 && selectedAction && !isSubmitted && !playerHasActed) {
        void handleSubmitAction();
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, [round.startTime, selectedAction, handleSubmitAction, isSubmitted, playerHasActed]);

  // Show different UI if player has already acted
  if (playerHasActed || isSubmitted) {
    return (
      <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 max-w-xl mx-auto border border-green-600">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">✓</span>
            </div>
            <span className="text-green-400 text-lg font-semibold">Action Submitted!</span>
          </div>
          <p className="text-gray-300 mb-2">Waiting for other players...</p>
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-gray-400">{timeLeft}s remaining</span>
          </div>
          
          {/* Show action that was selected */}
          {selectedAction && (
            <div className="mt-3 p-2 bg-green-900/30 rounded-lg border border-green-700">
              <p className="text-green-300 text-sm">Your choice: 
                <span className="font-semibold">
                  {selectedAction === "rock" ? "🗿 Rock" : 
                   selectedAction === "paper" ? "📄 Paper" : 
                   "✂️ Scissors"}
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 max-w-xl mx-auto border border-gray-700">
      {/* Timer */}
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Clock className={`w-4 h-4 ${
            timeLeft <= 10 ? 'text-red-400 animate-pulse' : 
            timeLeft <= 20 ? 'text-yellow-400' : 
            'text-gray-300'
          }`} />
          <span className={`text-lg font-semibold ${
            timeLeft <= 10 ? 'text-red-400 animate-pulse' : 
            timeLeft <= 20 ? 'text-yellow-400' : 
            'text-white'
          }`}>{timeLeft}s</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-1000 ${
              timeLeft <= 10 ? 'bg-gradient-to-r from-red-600 to-red-700 animate-pulse' :
              timeLeft <= 20 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
              'bg-gradient-to-r from-green-500 to-green-600'
            }`}
            style={{ width: `${(timeLeft / 30) * 100}%` }}
          />
        </div>
        {timeLeft <= 10 && (
          <p className="text-red-400 text-sm mt-1 animate-pulse font-semibold">⚠️ Time running out!</p>
        )}
      </div>

      {/* Bet Info */}
      <div className="text-center mb-4">
        <p className="text-gray-300 text-base">
          Bet Amount: <span className="font-semibold text-yellow-400">${round.betAmount}</span>
        </p>
        <p className="text-gray-400 text-xs mt-1">Choose your Rock Paper Scissors action</p>
      </div>

      {/* RPS Buttons */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { action: "paper", emoji: "📄", label: "Paper", description: "Check/Fold" },
          { action: "scissors", emoji: "✂️", label: "Scissors", description: "Check/Call" },
          { action: "rock", emoji: "🗿", label: "Rock", description: "Raise/Call" }
        ].map(({ action, emoji, label, description }) => (
          <button
            key={action}
            className={`p-3 rounded-lg border transition-all duration-300 transform ${
              selectedAction === action 
                ? `border-yellow-400 bg-gradient-to-br from-yellow-400/30 to-yellow-500/30 scale-110 shadow-xl ring-2 ring-yellow-400/50` 
                : `border-gray-600 bg-gradient-to-br from-gray-800 to-gray-700 hover:from-gray-700 hover:to-gray-600 hover:scale-105`
            } ${selectedAction === action ? 'animate-pulse' : ''}`}
            onClick={() => {
              setSelectedAction(action as any);
              playSound('select');
            }}
            disabled={isSubmitting}
          >
            <div className="text-center text-white">
              <div className={`text-3xl mb-2 transform transition-transform duration-200 ${
                selectedAction === action ? 'scale-125' : ''
              }`}>{emoji}</div>
              <div className="font-medium text-sm">{label}</div>
              <div className="text-xs opacity-70">{description}</div>
              {selectedAction === action && (
                <div className="mt-1 text-xs text-yellow-300 font-semibold">Selected ✓</div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Submit Button */}
      <button
        className={`w-full py-3 rounded-lg font-semibold transition-all duration-300 transform ${
          selectedAction && !isSubmitting
            ? "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg hover:scale-105 animate-pulse" 
            : isSubmitting
            ? "bg-gradient-to-r from-yellow-500 to-yellow-600 text-white cursor-wait"
            : "bg-gray-700 text-gray-400 cursor-not-allowed"
        }`}
        onClick={() => void handleSubmitAction()}
        disabled={!selectedAction || isSubmitting}
      >
        {isSubmitting ? (
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Submitting...
          </div>
        ) : selectedAction ? (
          <div className="flex items-center justify-center gap-2">
            <span>🚀 Submit Action</span>
          </div>
        ) : (
          "Choose an action first"
        )}
      </button>

      {/* Player Actions Status */}
      {round.actions.length > 0 && (
        <div className="mt-3 text-center">
          <p className="text-gray-400 text-xs mb-1">Players Ready:</p>
          <div className="flex justify-center gap-2">
            {round.actions.map((action: any) => (
              <div key={action._id} className="bg-gradient-to-r from-green-600 to-green-700 text-white px-2 py-1 rounded text-xs shadow-sm">
                {action.playerName} ✓
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionStandings() {
  const { gameId } = Route.useParams();
  const gameQueryOptions = convexQuery(api.games.getGame, { gameId: gameId as any });
  const { data: game } = useSuspenseQuery(gameQueryOptions);
  
  // Calculate table standings from current game players
  const getTableStandings = () => {
    if (!game?.players) return [];
    
    return game.players
      .map((player: any) => ({
        playerName: player.name,
        currentBalance: player.balance,
        profit: player.balance - 1000, // Starting balance was 1000
        status: player.status,
        _id: player._id
      }))
      .sort((a: any, b: any) => b.profit - a.profit); // Sort by profit descending
  };

  const tableStandings = getTableStandings();

  if (tableStandings.length === 0) {
    return (
      <div>
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2 text-white">
          <Trophy className="w-5 h-5" />
          Table Standings
        </h2>
        <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-center">Waiting for players to join this table...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xl font-bold flex items-center gap-2 text-white">
          <Trophy className="w-5 h-5" />
          Table Standings
        </h2>
        <div className="text-xs text-gray-400">
          Current Game: {game?.name || 'Poker Table'}
        </div>
      </div>
      
      <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50">
              <tr className="text-gray-300 text-sm">
                <th className="px-3 py-2 text-left">Rank</th>
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-right">Profit</th>
                <th className="px-3 py-2 text-center">Balance</th>
                <th className="px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {tableStandings.map((player, index) => (
                <tr key={player._id} className="border-t border-gray-700/50 hover:bg-gray-800/30">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 text-white">
                      {index === 0 && <Trophy className="w-3 h-3 text-yellow-500" />}
                      {index === 1 && <Trophy className="w-3 h-3 text-gray-400" />}
                      {index === 2 && <Trophy className="w-3 h-3 text-amber-600" />}
                      <span className="text-sm font-medium">#{index + 1}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-white text-sm flex items-center gap-1">
                      {player.playerName}
                      {player.status === "folded" && <span className="text-red-400 text-xs">(Folded)</span>}
                      {player.status === "out" && <span className="text-gray-500 text-xs">(Out)</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className={`font-mono font-semibold flex items-center justify-end gap-1 text-sm ${
                      player.profit > 0 ? 'text-green-400' : 
                      player.profit < 0 ? 'text-red-400' : 
                      'text-gray-300'
                    }`}>
                      {player.profit > 0 && <TrendingUp className="w-3 h-3" />}
                      {player.profit < 0 && <TrendingDown className="w-3 h-3" />}
                      ${player.profit.toLocaleString()}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-gray-300 text-sm">${player.currentBalance}</td>
                  <td className="px-3 py-2 text-center">
                    <div className={`text-xs px-2 py-1 rounded-full ${
                      player.status === "active" ? 'bg-green-600 text-white' :
                      player.status === "folded" ? 'bg-red-600 text-white' :
                      'bg-gray-600 text-white'
                    }`}>
                      {player.status.charAt(0).toUpperCase() + player.status.slice(1)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}