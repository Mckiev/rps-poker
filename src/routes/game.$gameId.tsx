import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Clock, DollarSign, Users, Home, RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/game/$gameId")({
  loader: async ({ context: { queryClient }, params: { gameId } }) => {
    if (!gameId) throw new Error("Game ID is required");
    const gameQueryOptions = convexQuery(api.games.getGame, { gameId: gameId as any });
    await queryClient.ensureQueryData(gameQueryOptions);
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
    <div className="min-h-screen bg-gradient-to-br from-green-800 via-green-700 to-green-900 p-4">
      <PokerTable game={gameData} />
    </div>
  );
}

function PokerTable({ game }: { game: any }) {
  const navigate = useNavigate();
  const currentPlayerId = localStorage.getItem(`player-${game._id}`);
  const playerName = localStorage.getItem("rps-poker-nickname") || "Player";
  
  const currentRoundQuery = convexQuery(api.actions.getCurrentBettingRound, { 
    gameId: game._id as any
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
      navigate({ to: `/game/${result.gameId}` });
    } catch (error) {
      console.error("Failed to create new game:", error);
    }
  };

  const handleReturnToLobby = () => {
    navigate({ to: "/" });
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Game Header */}
      <div className="text-center mb-6">
        <div className="flex justify-between items-center mb-4">
          <button 
            className="btn btn-ghost text-white"
            onClick={handleReturnToLobby}
          >
            <Home className="w-4 h-4" />
            Lobby
          </button>
          
          <h1 className="text-2xl font-bold text-white">
            {game.name || `Game ${game._id.slice(-6)}`} - Hand #{game.handNumber || 1} - {game.currentPhase.toUpperCase()}
          </h1>
          
          {game.status === "finished" && (
            <button 
              className="btn btn-primary"
              onClick={handlePlayAgain}
            >
              <RotateCcw className="w-4 h-4" />
              Play Again
            </button>
          )}
          {game.status !== "finished" && <div className="w-24"></div>}
        </div>
        
        <div className="flex justify-center items-center gap-6 text-white">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            <span className="text-xl font-bold">Pot: ${game.pot}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span>Ante: ${game.anteAmount}</span>
          </div>
        </div>
      </div>

      {/* Main Poker Table */}
      <div className="relative">
        {/* Poker Table Background */}
        <div className="w-full h-96 bg-gradient-to-br from-green-600 to-green-800 rounded-full border-8 border-amber-600 shadow-2xl relative overflow-hidden">
          {/* Table Felt Pattern */}
          <div className="absolute inset-4 bg-green-700 rounded-full border-4 border-green-500 shadow-inner">
            
            {/* Community Cards Area */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <div className="text-center mb-4">
                <h3 className="text-white font-semibold mb-3">Community Cards</h3>
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
                          <PlayingCard key={i} card={card} />
                        ))}
                        {hiddenCards.map((_, i) => (
                          <PlayingCard key={`hidden-${i}`} card="back" />
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
              
              {/* Pot Display */}
              <div className="text-center">
                <div className="bg-yellow-500 text-black px-4 py-2 rounded-full font-bold shadow-lg">
                  ${game.pot}
                </div>
              </div>
            </div>

            {/* Players positioned around the table */}
            <PlayersAroundTable players={game.players} currentPlayerId={currentPlayerId} />
          </div>
        </div>
      </div>

      {/* Showdown - All Players' Cards */}
      {game.currentPhase === "showdown" && (
        <div className="mt-6 text-center">
          <h3 className="text-white font-semibold mb-4">🃏 Showdown - All Players' Cards</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {game.players.filter((p: any) => p.status === "active" || p.status === "folded").map((player: any) => (
              <div key={player._id} className="bg-black/40 backdrop-blur-sm rounded-lg p-4">
                <div className={`mb-3 px-3 py-1 rounded-full text-sm font-semibold inline-block ${
                  player._id === currentPlayerId ? 'bg-yellow-400 text-black' :
                  player.status === "active" ? 'bg-green-600 text-white' :
                  'bg-red-600 text-white'
                }`}>
                  {player.name} {player.status === "folded" ? "(Folded)" : ""}
                </div>
                <div className="flex gap-2 justify-center">
                  {player.holeCards && player.holeCards.length > 0 ? (
                    player.holeCards.map((card: string, i: number) => (
                      <PlayingCard key={i} card={card} />
                    ))
                  ) : (
                    <>
                      <PlayingCard card="back" />
                      <PlayingCard card="back" />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player's Hole Cards - Only show during active play, not showdown */}
      {playerCards && game.currentPhase !== "showdown" && (
        <div className="mt-6 text-center">
          <h3 className="text-white font-semibold mb-3">Your Cards</h3>
          <div className="flex gap-3 justify-center">
            {playerCards.holeCards.map((card: string, i: number) => (
              <PlayingCard key={i} card={card} size="large" />
            ))}
          </div>
        </div>
      )}

      {/* Betting Interface */}
      {currentRound && game.status === "playing" && currentPlayerId && (
        <div className="mt-6">
          <BettingInterface 
            round={currentRound} 
            playerId={currentPlayerId}
          />
        </div>
      )}

      {/* Game Status */}
      <div className="mt-6 text-center">
        {game.status === "finished" ? (
          <div className="bg-black/50 backdrop-blur-sm rounded-lg p-6 max-w-md mx-auto">
            <h2 className="text-2xl font-bold text-white mb-4">🎉 Final Results</h2>
            
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
                onClick={handlePlayAgain}
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
              <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 mb-4 max-w-md mx-auto">
                <p className="text-yellow-200 font-semibold">
                  🏆 Last Hand: {game.lastHandWinner} won!
                </p>
              </div>
            )}
            
            <div className={`inline-block px-6 py-2 rounded-full text-white font-semibold ${
              game.status === "waiting" ? "bg-blue-600" :
              game.status === "playing" ? "bg-green-600" :
              "bg-gray-600"
            }`}>
              {game.status === "waiting" ? "Waiting for players" :
               game.status === "playing" ? `Hand #${game.handNumber || 1} - ${game.currentPhase.toUpperCase()}` :
               "Game Finished"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayingCard({ card, size = "normal" }: { card: string; size?: "normal" | "large" }) {
  const isBack = card === "back";
  const sizeClasses = size === "large" ? "w-16 h-24" : "w-12 h-18";
  
  return (
    <div className={`${sizeClasses} bg-white rounded-lg border-2 border-gray-300 shadow-lg flex items-center justify-center relative overflow-hidden`}>
      {isBack ? (
        <div className="w-full h-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
          <div className="text-white text-xs font-bold transform rotate-45">🃏</div>
        </div>
      ) : (
        <div className="text-center">
          <div className={`font-bold ${
            card.includes('♥') || card.includes('♦') ? 'text-red-600' : 'text-black'
          }`}>
            <div className="text-lg">{card[0]}</div>
            <div className="text-xl leading-none">{card[1]}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayersAroundTable({ players, currentPlayerId }: { players: any[]; currentPlayerId: string | null }) {
  // Calculate positions around the table (oval/circle)
  const getPlayerPosition = (index: number, total: number) => {
    const angle = (index * 360) / total - 90; // Start from top
    const radiusX = 45; // Horizontal radius percentage
    const radiusY = 35; // Vertical radius percentage
    const x = 50 + radiusX * Math.cos((angle * Math.PI) / 180);
    const y = 50 + radiusY * Math.sin((angle * Math.PI) / 180);
    return { x, y };
  };

  return (
    <>
      {players.map((player, index) => {
        const position = getPlayerPosition(index, players.length);
        const isCurrentPlayer = player._id === currentPlayerId;
        
        return (
          <div
            key={player._id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
          >
            <PlayerSeat player={player} isCurrentPlayer={isCurrentPlayer} />
          </div>
        );
      })}
    </>
  );
}

function PlayerSeat({ player, isCurrentPlayer }: { player: any; isCurrentPlayer: boolean }) {
  return (
    <div className={`text-center ${isCurrentPlayer ? 'scale-110' : ''}`}>
      {/* Player Name */}
      <div className={`px-3 py-1 rounded-full text-sm font-semibold mb-2 ${
        isCurrentPlayer ? 'bg-yellow-400 text-black' :
        player.status === "active" ? 'bg-green-600 text-white' :
        player.status === "folded" ? 'bg-red-600 text-white' :
        'bg-gray-600 text-white'
      }`}>
        {player.name}
      </div>
      
      {/* Balance */}
      <div className="bg-black text-yellow-400 px-2 py-1 rounded text-sm font-mono">
        ${player.balance}
      </div>
      
      {/* Status Indicator */}
      <div className={`mt-1 w-3 h-3 rounded-full mx-auto ${
        player.status === "active" ? 'bg-green-400' :
        player.status === "folded" ? 'bg-red-400' :
        'bg-gray-400'
      }`} />
    </div>
  );
}

function BettingInterface({ round, playerId }: { round: any; playerId: string }) {
  const [selectedAction, setSelectedAction] = useState<"paper" | "scissors" | "rock" | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const makeAction = useMutation(api.actions.makeAction);
  
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - round.startTime) / 1000);
      const remaining = Math.max(0, 30 - elapsed);
      setTimeLeft(remaining);
      
      if (remaining === 0 && selectedAction) {
        handleSubmitAction();
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, [round.startTime, selectedAction]);

  const handleSubmitAction = async () => {
    if (!selectedAction) return;
    
    try {
      await makeAction({ 
        playerId: playerId as any, 
        action: selectedAction 
      });
    } catch (error) {
      console.error("Failed to submit action:", error);
    }
  };

  return (
    <div className="bg-black/50 backdrop-blur-sm rounded-lg p-6 max-w-2xl mx-auto">
      {/* Timer */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Clock className="w-5 h-5 text-white" />
          <span className="text-white text-xl font-bold">{timeLeft}s</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className="bg-red-500 h-2 rounded-full transition-all duration-1000"
            style={{ width: `${(timeLeft / 30) * 100}%` }}
          />
        </div>
      </div>

      {/* Bet Info */}
      <div className="text-center mb-6">
        <p className="text-white text-lg">
          Bet Amount: <span className="font-bold text-yellow-400">${round.betAmount}</span>
        </p>
        <p className="text-gray-300 text-sm">Choose your Rock Paper Scissors action</p>
      </div>

      {/* RPS Buttons */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { action: "paper", emoji: "📄", label: "Paper", description: "Check/Fold" },
          { action: "scissors", emoji: "✂️", label: "Scissors", description: "Check/Call" },
          { action: "rock", emoji: "🗿", label: "Rock", description: "Raise/Call" }
        ].map(({ action, emoji, label, description }) => (
          <button
            key={action}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedAction === action 
                ? "border-yellow-400 bg-yellow-400/20 scale-105" 
                : "border-gray-600 bg-gray-800 hover:bg-gray-700"
            }`}
            onClick={() => setSelectedAction(action as any)}
          >
            <div className="text-center text-white">
              <div className="text-3xl mb-2">{emoji}</div>
              <div className="font-semibold">{label}</div>
              <div className="text-xs opacity-80">{description}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Submit Button */}
      <button
        className="btn btn-success btn-block btn-lg"
        onClick={handleSubmitAction}
        disabled={!selectedAction}
      >
        Submit Action
      </button>

      {/* Player Actions Status */}
      {round.actions.length > 0 && (
        <div className="mt-4 text-center">
          <p className="text-white text-sm mb-2">Players Ready:</p>
          <div className="flex justify-center gap-2">
            {round.actions.map((action: any) => (
              <div key={action._id} className="bg-green-600 text-white px-2 py-1 rounded text-xs">
                {action.playerName} ✓
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}