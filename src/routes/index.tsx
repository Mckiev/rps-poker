import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Gamepad2, Plus, Users } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

const availableGamesQueryOptions = convexQuery(api.games.getAvailableGames, {});

export const Route = createFileRoute("/")({
  loader: async ({ context: { queryClient } }) =>
    await queryClient.ensureQueryData(availableGamesQueryOptions),
  component: HomePage,
});

function HomePage() {
  const [playerName, setPlayerName] = useState(() => {
    // Load saved nickname from localStorage
    return localStorage.getItem("rps-poker-nickname") || "";
  });
  const [showCreateGame, setShowCreateGame] = useState(false);
  const navigate = useNavigate();

  // Save nickname to localStorage whenever it changes
  const updatePlayerName = (name: string) => {
    setPlayerName(name);
    if (name.trim()) {
      localStorage.setItem("rps-poker-nickname", name.trim());
    } else {
      localStorage.removeItem("rps-poker-nickname");
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="not-prose flex justify-center mb-4">
          <Gamepad2 className="w-16 h-16 text-primary" />
        </div>
        <h1 className="text-4xl font-bold mb-2">Rock Paper Scissors Poker</h1>
        <p className="text-lg opacity-80">
          Fast-paced Texas Hold'em with simultaneous RPS betting
        </p>
      </div>

      {!playerName ? (
        <PlayerNameForm onSubmit={updatePlayerName} />
      ) : (
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-lg">Welcome, <span className="font-bold text-primary">{playerName}</span>!</p>
            <button 
              className="btn btn-ghost btn-sm mt-2"
              onClick={() => updatePlayerName("")}
            >
              Change Name
            </button>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              className="btn btn-primary btn-lg"
              onClick={() => setShowCreateGame(!showCreateGame)}
            >
              <Plus className="w-5 h-5" />
              Create New Game
            </button>
          </div>

          {showCreateGame && (
            <CreateGameForm playerName={playerName} onSuccess={(gameId) => {
              void navigate({ to: `/game/${gameId}` });
            }} />
          )}

          <AvailableGamesList playerName={playerName} />
        </div>
      )}
    </div>
  );
}

function PlayerNameForm({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");


  return (
    <div className="max-w-md mx-auto">
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body">
          <h2 className="card-title">Enter Your Name</h2>
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onSubmit(name.trim()); } }} className="space-y-4">
            <div className="form-control">
              <input
                type="text"
                placeholder="Your name"
                className="input input-bordered input-lg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                autoFocus
              />
            </div>
            <button 
              type="submit" 
              className="btn btn-primary btn-block btn-lg"
              disabled={!name.trim()}
            >
              Join Game
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function CreateGameForm({ 
  playerName, 
  onSuccess 
}: { 
  playerName: string; 
  onSuccess: (gameId: string) => void;
}) {
  const [anteAmount, setAnteAmount] = useState(10);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const createGame = useMutation(api.games.createGame);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await createGame({ 
        playerName, 
        anteAmount, 
        maxPlayers 
      });
      const gameId = result.gameId;
      const playerId = result.playerId;
      localStorage.setItem(`player-${gameId}`, playerId);
      onSuccess(gameId);
    } catch (error) {
      console.error("Failed to create game:", error);
    }
  };

  return (
    <div className="card bg-base-200 shadow-lg max-w-md mx-auto">
      <div className="card-body">
        <h3 className="card-title">Create New Game</h3>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">Ante Amount</span>
            </label>
            <input
              type="number"
              className="input input-bordered"
              value={anteAmount}
              onChange={(e) => setAnteAmount(Number(e.target.value))}
              min={1}
              max={100}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Max Players</span>
            </label>
            <select 
              className="select select-bordered"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            >
              {[2, 3, 4, 5, 6, 7, 8].map(num => (
                <option key={num} value={num}>{num} players</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary btn-block">
            Create Game
          </button>
        </form>
      </div>
    </div>
  );
}

function AvailableGamesList({ playerName }: { playerName: string }) {
  const { data: games } = useSuspenseQuery(availableGamesQueryOptions);
  const joinGame = useMutation(api.games.joinGame);
  const navigate = useNavigate();

  const handleJoinGame = async (gameId: string) => {
    try {
      const playerId = await joinGame({ gameId: gameId as any, playerName });
      localStorage.setItem(`player-${gameId}`, playerId);
      void navigate({ to: `/game/${gameId}` });
    } catch (error) {
      console.error("Failed to join game:", error);
      alert(error instanceof Error ? error.message : "Failed to join game");
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Users className="w-6 h-6" />
        Available Games
      </h2>
      
      {games.length === 0 ? (
        <div className="card bg-base-200">
          <div className="card-body text-center">
            <p className="opacity-70">No games available. Create one to get started!</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {games.map((game) => (
            <div key={game._id} className="card bg-base-200 shadow-sm">
              <div className="card-body">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold">{game.name || `Game ${game._id.slice(-6)}`}</h3>
                    <p className="text-sm opacity-70">
                      {game.playerCount}/{game.maxPlayers} players • Ante: ${game.anteAmount}
                    </p>
                  </div>
                  <button 
                    className="btn btn-primary"
                    onClick={() => void handleJoinGame(game._id)}
                    disabled={game.playerCount >= game.maxPlayers}
                  >
                    {game.playerCount >= game.maxPlayers ? "Full" : "Join"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}