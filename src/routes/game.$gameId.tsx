import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Clock, Hand, DollarSign } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/game/$gameId")({
  loader: async ({ context: { queryClient }, params: { gameId } }) => {
    const gameQueryOptions = convexQuery(api.games.getGame, { gameId });
    await queryClient.ensureQueryData(gameQueryOptions);
  },
  component: GamePage,
});

function GamePage() {
  const { gameId } = Route.useParams();
  const gameQueryOptions = convexQuery(api.games.getGame, { gameId });
  const { data: gameData } = useSuspenseQuery(gameQueryOptions);
  
  if (!gameData) {
    return <div className="text-center p-8">Game not found</div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Game Area */}
        <div className="lg:col-span-3">
          <GameTable game={gameData} />
        </div>
        
        {/* Player List & Info */}
        <div className="space-y-4">
          <PlayersList players={gameData.players} />
          <GameInfo game={gameData} />
        </div>
      </div>
    </div>
  );
}

function GameTable({ game }: { game: any }) {
  const currentRoundQuery = convexQuery(api.actions.getCurrentBettingRound, { 
    gameId: game._id 
  });
  const { data: currentRound } = useSuspenseQuery(currentRoundQuery);
  
  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold">Game {game._id.slice(-6)}</h2>
          <div className="flex justify-center items-center gap-4 mt-2">
            <div className="badge badge-primary badge-lg">
              {game.status === "waiting" ? "Waiting for players" : 
               game.status === "playing" ? `${game.currentPhase.toUpperCase()}` : 
               "Game Over"}
            </div>
            <div className="flex items-center gap-1">
              <DollarSign className="w-4 h-4" />
              <span className="font-bold">Pot: ${game.pot}</span>
            </div>
          </div>
        </div>

        {/* Community Cards */}
        {game.status === "playing" && (
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold mb-2">Community Cards</h3>
            <div className="flex justify-center gap-2">
              {game.communityCards.slice(0, 
                game.currentPhase === "flop" ? 3 :
                game.currentPhase === "turn" ? 4 :
                game.currentPhase === "river" ? 5 : 0
              ).map((card: string, i: number) => (
                <div key={i} className="card bg-base-100 w-12 h-16 shadow-md flex items-center justify-center">
                  <span className="text-lg font-bold">{card}</span>
                </div>
              ))}
              {/* Placeholder for hidden cards */}
              {Array.from({ 
                length: Math.max(0, 5 - Math.max(3, 
                  game.currentPhase === "flop" ? 3 :
                  game.currentPhase === "turn" ? 4 :
                  game.currentPhase === "river" ? 5 : 0
                ))
              }).map((_, i) => (
                <div key={`hidden-${i}`} className="card bg-base-300 w-12 h-16 shadow-md flex items-center justify-center">
                  <span className="text-xs opacity-50">?</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Betting Interface */}
        {currentRound && game.status === "playing" && (
          <BettingInterface round={currentRound} gameId={game._id} />
        )}
      </div>
    </div>
  );
}

function BettingInterface({ round, gameId }: { round: any; gameId: string }) {
  const [selectedAction, setSelectedAction] = useState<"paper" | "scissors" | "rock" | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const makeAction = useMutation(api.actions.makeAction);
  
  // For MVP, we'll use localStorage to track current player
  // In production, you'd want proper session management
  const currentPlayerId = localStorage.getItem(`player-${gameId}`);
  
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - round.startTime) / 1000);
      const remaining = Math.max(0, 30 - elapsed);
      setTimeLeft(remaining);
      
      if (remaining === 0 && selectedAction) {
        // Auto-submit if time runs out
        handleSubmitAction();
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, [round.startTime, selectedAction]);

  const handleSubmitAction = async () => {
    if (!selectedAction || !currentPlayerId) return;
    
    try {
      await makeAction({ 
        playerId: currentPlayerId, 
        action: selectedAction 
      });
    } catch (error) {
      console.error("Failed to submit action:", error);
    }
  };

  const actionLabels = {
    paper: "Paper (Check/Fold)",
    scissors: "Scissors (Check/Call)",
    rock: "Rock (Raise/Call)"
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Clock className="w-5 h-5" />
          <span className="text-lg font-bold">
            {timeLeft}s remaining
          </span>
        </div>
        <div className="progress progress-primary w-full">
          <div 
            className="progress-bar" 
            style={{ width: `${(timeLeft / 30) * 100}%` }}
          />
        </div>
      </div>

      <div className="text-center">
        <p className="mb-4">
          Bet Amount: <span className="font-bold">${round.betAmount}</span>
        </p>
        <p className="text-sm opacity-70 mb-4">
          Choose your action for this betting round
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(["paper", "scissors", "rock"] as const).map((action) => (
          <button
            key={action}
            className={`btn btn-lg ${
              selectedAction === action 
                ? "btn-primary" 
                : "btn-outline btn-primary"
            }`}
            onClick={() => setSelectedAction(action)}
          >
            <div className="text-center">
              <div className="text-2xl mb-1">
                {action === "paper" ? "📄" : 
                 action === "scissors" ? "✂️" : "🗿"}
              </div>
              <div className="text-xs">
                {actionLabels[action]}
              </div>
            </div>
          </button>
        ))}
      </div>

      <button
        className="btn btn-success btn-block btn-lg"
        onClick={handleSubmitAction}
        disabled={!selectedAction}
      >
        Submit Action
      </button>

      {/* Show other players' actions (masked) */}
      <div className="mt-4">
        <h4 className="font-semibold mb-2">Player Actions:</h4>
        <div className="grid grid-cols-2 gap-2">
          {round.actions.map((action: any) => (
            <div key={action._id} className="badge badge-outline">
              {action.playerName}: ✅ Ready
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlayersList({ players }: { players: any[] }) {
  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body">
        <h3 className="card-title text-lg">Players</h3>
        <div className="space-y-2">
          {players.map((player) => (
            <div key={player._id} className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Hand className="w-4 h-4" />
                <span className="font-medium">{player.name}</span>
                <div className={`badge badge-sm ${
                  player.status === "active" ? "badge-success" :
                  player.status === "folded" ? "badge-warning" :
                  "badge-error"
                }`}>
                  {player.status}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-primary">${player.balance}</div>
                <div className="text-xs opacity-70">Position {player.position + 1}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GameInfo({ game }: { game: any }) {
  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body">
        <h3 className="card-title text-lg">Game Info</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Ante:</span>
            <span className="font-bold">${game.anteAmount}</span>
          </div>
          <div className="flex justify-between">
            <span>Max Players:</span>
            <span className="font-bold">{game.maxPlayers}</span>
          </div>
          <div className="flex justify-between">
            <span>Current Pot:</span>
            <span className="font-bold text-primary">${game.pot}</span>
          </div>
        </div>
      </div>
    </div>
  );
}