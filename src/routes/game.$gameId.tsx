import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Clock, DollarSign, Users, Home, RotateCcw, Trophy, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { api } from "../../convex/_generated/api";

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

  return (
    <div className="max-w-5xl mx-auto">
      {/* Game Header */}
      <div className="text-center mb-3">
        <div className="flex justify-between items-center mb-2">
          <button 
            className="btn btn-ghost text-white"
            onClick={handleReturnToLobby}
          >
            <Home className="w-4 h-4" />
            Lobby
          </button>
          
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
            <DollarSign className="w-4 h-4" />
            <span className="text-base font-bold">Pot: ${game.pot}</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span className="text-sm">Ante: ${game.anteAmount}</span>
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
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <div className="text-center mb-2">
                <h3 className="text-white font-medium text-sm mb-2">Community Cards</h3>
                <div className="flex gap-2 justify-center">
                  {game.status === "playing" && (() => {
                    const cardsToShow = 
                      game.currentPhase === "preflop" ? 0 :
                      game.currentPhase === "flop" ? 3 :
                      game.currentPhase === "turn" ? 4 :
                      game.currentPhase === "river" || game.currentPhase === "showdown" ? 5 : 0;
                    
                    // Show revealed community cards
                    const revealedCards = game.communityCards.slice(0, cardsToShow);
                    // Show hidden placeholder cards
                    const hiddenCards = Array.from({ length: Math.max(0, 5 - cardsToShow) });
                    
                    return (
                      <>
                        {revealedCards.map((card: string, i: number) => (
                          <PlayingCard key={i} card={card} size="medium" />
                        ))}
                        {hiddenCards.map((_, i) => (
                          <PlayingCard key={`hidden-${i}`} card="back" size="medium" />
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
              
              {/* Pot Display */}
              <div className="text-center mt-2">
                <div className="bg-yellow-500 text-black px-3 py-1 rounded-full font-bold text-sm shadow-lg">
                  ${game.pot}
                </div>
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
                  🏆 Last Hand: {game.lastHandWinner} won!
                </p>
              </div>
            )}
            
            <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-medium ${
              game.status === "waiting" ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white" :
              game.status === "playing" ? "bg-gradient-to-r from-green-600 to-green-700 text-white" :
              "bg-gray-700 text-gray-300"
            } shadow-lg`}>
              {game.status === "waiting" ? "Waiting for players" :
               game.status === "playing" ? `Hand #${game.handNumber || 1} - ${game.currentPhase.toUpperCase()}` :
               "Game Finished"}
            </div>
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
        <div className="flex gap-1 justify-center mb-2">
          {player.holeCards.map((card: string, i: number) => (
            <PlayingCard key={i} card={card} size="medium" />
          ))}
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
  const makeAction = useMutation(api.actions.makeAction);
  
  const handleSubmitAction = useCallback(async () => {
    if (!selectedAction) return;
    
    try {
      await makeAction({ 
        playerId: playerId as any, 
        action: selectedAction 
      });
    } catch (error) {
      console.error("Failed to submit action:", error);
    }
  }, [selectedAction, playerId, makeAction]);
  
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - round.startTime) / 1000);
      const remaining = Math.max(0, 30 - elapsed);
      setTimeLeft(remaining);
      
      if (remaining === 0 && selectedAction) {
        void handleSubmitAction();
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, [round.startTime, selectedAction, handleSubmitAction]);

  return (
    <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 max-w-xl mx-auto border border-gray-700">
      {/* Timer */}
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-gray-300" />
          <span className="text-white text-lg font-semibold">{timeLeft}s</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5">
          <div 
            className="bg-gradient-to-r from-red-500 to-red-600 h-1.5 rounded-full transition-all duration-1000"
            style={{ width: `${(timeLeft / 30) * 100}%` }}
          />
        </div>
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
            className={`p-3 rounded-lg border transition-all duration-200 ${
              selectedAction === action 
                ? "border-yellow-400 bg-gradient-to-br from-yellow-400/20 to-yellow-500/20 scale-105 shadow-lg" 
                : "border-gray-600 bg-gradient-to-br from-gray-800 to-gray-700 hover:from-gray-700 hover:to-gray-600"
            }`}
            onClick={() => setSelectedAction(action as any)}
          >
            <div className="text-center text-white">
              <div className="text-2xl mb-1">{emoji}</div>
              <div className="font-medium text-sm">{label}</div>
              <div className="text-xs opacity-70">{description}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Submit Button */}
      <button
        className={`w-full py-3 rounded-lg font-semibold transition-all duration-200 ${
          selectedAction 
            ? "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg" 
            : "bg-gray-700 text-gray-400 cursor-not-allowed"
        }`}
        onClick={() => void handleSubmitAction()}
        disabled={!selectedAction}
      >
        Submit Action
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