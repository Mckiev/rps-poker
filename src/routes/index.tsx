import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Gamepad2, Users } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../../convex/_generated/api";

const getMainTableQueryOptions = convexQuery(api.games.getMainTable, {});

export const Route = createFileRoute("/")({
  loader: async ({ context: { queryClient } }) => {
    return await queryClient.ensureQueryData(getMainTableQueryOptions);
  },
  component: HomePage,
});

function HomePage() {
  const [playerName, setPlayerName] = useState(() => {
    // Load saved nickname from localStorage
    return localStorage.getItem("rps-poker-nickname") || "";
  });

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
          
          <MainTable playerName={playerName} />

          {/* Version Info */}
          <div className="mt-8 text-center">
            <div className="inline-block bg-gray-800 border border-gray-600 px-4 py-2 rounded-lg text-sm text-gray-300 shadow-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="font-medium">Latest update: Jun 5, 2025 3:06 PM PDT</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">Simplified to single main table - removed game creation</div>
            </div>
          </div>
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

function MainTable({ playerName }: { playerName: string }) {
  const { data: mainTable } = useSuspenseQuery(getMainTableQueryOptions);
  const getOrCreateMainTable = useMutation(api.games.getOrCreateMainTable);
  const joinGame = useMutation(api.games.joinGame);
  const navigate = useNavigate();

  useEffect(() => {
    if (!mainTable) {
      void getOrCreateMainTable({});
    }
  }, [mainTable, getOrCreateMainTable]);

  const handleJoinTable = async () => {
    if (!mainTable) return;
    
    try {
      const playerId = await joinGame({ gameId: mainTable._id as any, playerName });
      localStorage.setItem(`player-${mainTable._id}`, playerId);
      void navigate({ to: `/game/${mainTable._id}` });
    } catch (error) {
      console.error("Failed to join table:", error);
      alert(error instanceof Error ? error.message : "Failed to join table");
    }
  };

  if (!mainTable) {
    return (
      <div className="max-w-2xl mx-auto text-center">
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <div className="loading loading-spinner loading-lg mx-auto"></div>
            <p className="text-lg">Setting up the main table...</p>
          </div>
        </div>
      </div>
    );
  }

  const availableSeats = mainTable.maxPlayers - (mainTable.playerCount || 0);
  const isFull = availableSeats <= 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-primary mb-2">🎰 The Main Table</h2>
        <p className="text-lg opacity-80">Rock Paper Scissors Poker • $10 Ante • 8 Seats</p>
      </div>

      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <div className="text-center">
            <h3 className="card-title justify-center text-xl mb-4">
              {mainTable.name}
            </h3>
            
            {/* Player Count Visualization */}
            <div className="flex justify-center mb-4">
              <div className="flex gap-2">
                {Array.from({ length: mainTable.maxPlayers }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                      i < (mainTable.playerCount || 0) 
                        ? 'bg-primary border-primary text-primary-content' 
                        : 'border-gray-600 text-gray-500'
                    }`}
                  >
                    {i < (mainTable.playerCount || 0) ? '👤' : '○'}
                  </div>
                ))}
              </div>
            </div>

            <div className="stats stats-horizontal shadow mb-6">
              <div className="stat">
                <div className="stat-title">Players</div>
                <div className="stat-value text-2xl">{mainTable.playerCount || 0}/{mainTable.maxPlayers}</div>
              </div>
              <div className="stat">
                <div className="stat-title">Status</div>
                <div className={`stat-value text-lg ${
                  mainTable.status === 'waiting' ? 'text-blue-500' : 
                  mainTable.status === 'playing' ? 'text-green-500' : 
                  'text-gray-500'
                }`}>
                  {mainTable.status === 'waiting' ? 'Waiting' : 
                   mainTable.status === 'playing' ? 'Playing' : 
                   'Finished'}
                </div>
              </div>
              <div className="stat">
                <div className="stat-title">Hand</div>
                <div className="stat-value text-lg">#{mainTable.handNumber || 1}</div>
              </div>
            </div>

            <div className="text-center">
              {isFull ? (
                <div className="text-center">
                  <p className="text-orange-500 mb-3">🔥 Table is full! Wait for a seat to open.</p>
                  <button 
                    className="btn btn-outline"
                    onClick={() => void navigate({ to: `/game/${mainTable._id}` })}
                  >
                    Spectate Game
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-green-500 mb-3">
                    ✨ {availableSeats} seat{availableSeats !== 1 ? 's' : ''} available
                  </p>
                  <button 
                    className="btn btn-primary btn-lg"
                    onClick={() => void handleJoinTable()}
                  >
                    <Users className="w-5 h-5" />
                    Join The Table
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}