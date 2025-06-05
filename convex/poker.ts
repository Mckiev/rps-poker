// Poker hand evaluation utilities

export type Card = string; // Format: "AS", "KH", "2C", etc.
export type Hand = Card[];

export interface HandRank {
  rank: number; // Higher is better
  name: string;
  kickers: number[]; // For tiebreaking
}

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export function parseCard(card: Card): { rank: number; suit: string } {
  const rank = RANKS.indexOf(card[0]);
  const suit = card[1];
  return { rank, suit };
}

export function evaluateHand(holeCards: Card[], communityCards: Card[]): HandRank {
  const allCards = [...holeCards, ...communityCards];
  const best = findBestFiveCardHand(allCards);
  return evaluateFiveCardHand(best);
}

function findBestFiveCardHand(cards: Card[]): Card[] {
  const combinations = getCombinations(cards, 5);
  let bestHand = combinations[0];
  let bestRank = evaluateFiveCardHand(bestHand);

  for (const hand of combinations.slice(1)) {
    const rank = evaluateFiveCardHand(hand);
    if (compareHands(rank, bestRank) > 0) {
      bestHand = hand;
      bestRank = rank;
    }
  }

  return bestHand;
}

function getCombinations<T>(arr: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (arr.length === 0) return [];
  
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, size - 1).map(combo => [first, ...combo]);
  const withoutFirst = getCombinations(rest, size);
  
  return [...withFirst, ...withoutFirst];
}

function evaluateFiveCardHand(cards: Card[]): HandRank {
  const parsed = cards.map(parseCard);
  const ranks = parsed.map(c => c.rank).sort((a, b) => b - a);
  const suits = parsed.map(c => c.suit);
  
  const rankCounts = new Map<number, number>();
  ranks.forEach(rank => {
    rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1);
  });
  
  const counts = Array.from(rankCounts.values()).sort((a, b) => b - a);
  const isFlush = suits.every(suit => suit === suits[0]);
  const isStraight = ranks.every((rank, i) => i === 0 || ranks[i-1] === rank + 1) ||
    (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0); // A-2-3-4-5
  
  // Royal Flush
  if (isFlush && isStraight && ranks[0] === 12) {
    return { rank: 9, name: "Royal Flush", kickers: [] };
  }
  
  // Straight Flush
  if (isFlush && isStraight) {
    return { rank: 8, name: "Straight Flush", kickers: [ranks[0]] };
  }
  
  // Four of a Kind
  if (counts[0] === 4) {
    const fourKind = Array.from(rankCounts.entries()).find(([_, count]) => count === 4)![0];
    const kicker = Array.from(rankCounts.entries()).find(([_, count]) => count === 1)![0];
    return { rank: 7, name: "Four of a Kind", kickers: [fourKind, kicker] };
  }
  
  // Full House
  if (counts[0] === 3 && counts[1] === 2) {
    const trips = Array.from(rankCounts.entries()).find(([_, count]) => count === 3)![0];
    const pair = Array.from(rankCounts.entries()).find(([_, count]) => count === 2)![0];
    return { rank: 6, name: "Full House", kickers: [trips, pair] };
  }
  
  // Flush
  if (isFlush) {
    return { rank: 5, name: "Flush", kickers: ranks };
  }
  
  // Straight
  if (isStraight) {
    return { rank: 4, name: "Straight", kickers: [ranks[0]] };
  }
  
  // Three of a Kind
  if (counts[0] === 3) {
    const trips = Array.from(rankCounts.entries()).find(([_, count]) => count === 3)![0];
    const kickers = Array.from(rankCounts.entries())
      .filter(([_, count]) => count === 1)
      .map(([rank, _]) => rank)
      .sort((a, b) => b - a);
    return { rank: 3, name: "Three of a Kind", kickers: [trips, ...kickers] };
  }
  
  // Two Pair
  if (counts[0] === 2 && counts[1] === 2) {
    const pairs = Array.from(rankCounts.entries())
      .filter(([_, count]) => count === 2)
      .map(([rank, _]) => rank)
      .sort((a, b) => b - a);
    const kicker = Array.from(rankCounts.entries()).find(([_, count]) => count === 1)![0];
    return { rank: 2, name: "Two Pair", kickers: [...pairs, kicker] };
  }
  
  // Pair
  if (counts[0] === 2) {
    const pair = Array.from(rankCounts.entries()).find(([_, count]) => count === 2)![0];
    const kickers = Array.from(rankCounts.entries())
      .filter(([_, count]) => count === 1)
      .map(([rank, _]) => rank)
      .sort((a, b) => b - a);
    return { rank: 1, name: "Pair", kickers: [pair, ...kickers] };
  }
  
  // High Card
  return { rank: 0, name: "High Card", kickers: ranks };
}

export function compareHands(hand1: HandRank, hand2: HandRank): number {
  if (hand1.rank !== hand2.rank) {
    return hand1.rank - hand2.rank;
  }
  
  // Compare kickers
  for (let i = 0; i < Math.max(hand1.kickers.length, hand2.kickers.length); i++) {
    const k1 = hand1.kickers[i] || -1;
    const k2 = hand2.kickers[i] || -1;
    if (k1 !== k2) {
      return k1 - k2;
    }
  }
  
  return 0; // Tie
}