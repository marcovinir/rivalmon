import { BID_STEPS, type BaseStats, type BattleMove, type TypeName } from "@pokemon-minigames/shared";
import type { Rng } from "../rng.js";
import { pickOne } from "../rng.js";
import { type Fighter, availableMoves, bestMove, bothFallenLoser, endOfTurn, enterBattle, hpShare, moveData, newFighter, resolveTurn, roundLimitLoser } from "./combat.js";
import {
  MAX_CALM_TURNS,
  STARTING_MONEY,
  TRAP_ODDS,
  TEAM_SIZE,
  bidCap,
  drawLots,
  startingPrice,
} from "./rules.js";

/**
 * Simulador de Subasta Pokémon, para ajustar los números antes de construir el juego. Sus estrategias son simples: sirven
 * para detectar desequilibrios gordos, no para decir que el juego está equilibrado con personas.
 */
export interface AuctionPokemon {
  id: number;
  types: TypeName[];
  total: number;
  stats: BaseStats;
}

const HEAL_BELOW = 0.35;

export interface Strategy {
  name: string;
  /** Cuánto paga como máximo por un Pokémon, sobre su precio inicial. Solo ve el total de la silueta mostrada. */
  pokemonFactor: (shownTotal: number) => number;
}

export const STRATEGIES = {
  tacaña: { name: "tacaña", pokemonFactor: () => 0.95 },
  equilibrada: { name: "equilibrada", pokemonFactor: () => 1.3 },
  derrochadora: { name: "derrochadora", pokemonFactor: () => 2.5 },
  // Reconoce las siluetas: paga mucho por las fuertes y poco por las débiles.
  experta: { name: "experta", pokemonFactor: (total: number) => (total >= 500 ? 2 : total >= 380 ? 1.2 : 0.9) },
} satisfies Record<string, Strategy>;

export interface SimulationOptions {
  traps: boolean;
  criticals?: boolean;
}

export interface SimulationResult {
  winner: 0 | 1;
  teamSizes: [number, number];
  moneyLeft: [number, number];
  /** Partes de la subasta: lo que tarda depende de cuántas pujas hubo. */
  bidTurns: number;
  /** Caídas: cada una cierra un tramo del combate seguido. */
  rounds: number;
  /** Los turnos de cada tramo, hasta la caída. */
  turnsPerRound: number[];
  /** Caídas por el límite de turnos seguidos. */
  roundsAtLimit: number;
  traps: number;
  criticals: number;
  doubleKnockouts?: number;
  /** Dinero gastado por cada jugador. */
  spent: [number, number];
}

/** Azar reproducible (mulberry32): la misma semilla da la misma partida. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (maxExclusive) => Math.floor(next() * maxExclusive) };
}

type Seat = 0 | 1;
const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

interface Player {
  strategy: Strategy;
  money: number;
  team: AuctionPokemon[];
}

/**
 * Una puja abierta por turnos. Retirarse es definitivo: si hay puja, el otro se la lleva; si no, el otro la abre y se la
 * lleva a ese precio, o también se retira y no hay venta (`null`).
 */
function runBidding(starter: Seat, price: number, limitOf: (seat: Seat) => number, rng: Rng, count: () => void): { winner: Seat; paid: number } | null {
  let current: number | null = null;
  let leader: Seat | null = null;
  let turn = starter;
  let firstRetired = false;
  for (;;) {
    count();
    const next: number = current === null ? price : current + pickOne(rng, BID_STEPS);
    if (next <= limitOf(turn)) {
      current = next;
      leader = turn;
      if (firstRetired) return { winner: leader, paid: current };
      turn = other(turn);
      continue;
    }
    if (leader !== null) return { winner: leader, paid: current! };
    if (firstRetired) return null;
    firstRetired = true;
    turn = other(turn);
  }
}

/** La misma puja con límites fijos y saltos dados, para probar sus reglas. */
export function openingBid(price: number, limits: { first: number; second: number }, steps: readonly number[]): { winner: Seat; paid: number } | null {
  let index = 0;
  const rng: Rng = { int: () => index++ % steps.length };
  const stepAware: Rng = { int: (max) => (max === BID_STEPS.length ? BID_STEPS.indexOf(steps[rng.int(steps.length)] as never) : 0) };
  return runBidding(0, price, (seat) => (seat === 0 ? limits.first : limits.second), stepAware, () => undefined);
}

function runAuction(pool: readonly AuctionPokemon[], players: [Player, Player], options: SimulationOptions, rng: Rng, result: SimulationResult): void {
  const lots = drawLots(pool, rng);
  let starter: Seat = rng.int(2) as Seat;
  const countBid = () => {
    result.bidTurns++;
  };
  const pay = (seat: Seat, price: number) => {
    // Si no le alcanza, se lo lleva gratis: todos terminan con su equipo completo.
    const paid = players[seat].money >= price ? price : 0;
    players[seat].money -= paid;
    result.spent[seat] += paid;
  };

  const shownIds = new Set(lots.map((lot) => lot.id));
  const decoys = () => pool.filter((one) => !shownIds.has(one.id));

  lots.forEach((real, index) => {
    const isTrap = options.traps && rng.int(TRAP_ODDS) === 0;
    let shown = real;
    if (isTrap) {
      shown = pickOne(rng, decoys());
      shownIds.add(shown.id);
      result.traps++;
    }
    const price = startingPrice(shown.total, rng);
    const full = players.map((player) => player.team.length >= TEAM_SIZE);

    if (full[0] || full[1]) {
      const seat: Seat = full[0] ? 1 : 0;
      pay(seat, price);
      players[seat].team.push(real);
    } else {
      const limitOf = (seat: Seat) => {
        const player = players[seat];
        return Math.min(player.money, bidCap(player.money, player.team.length), price * player.strategy.pokemonFactor(shown.total));
      };
      const sale = runBidding(starter, price, limitOf, rng, countBid);
      if (sale) {
        pay(sale.winner, sale.paid);
        players[sale.winner].team.push(real);
      } else {
        const [a, b] = [players[0].team.length, players[1].team.length];
        const seat: Seat = a === b ? starter : a < b ? 0 : 1;
        pay(seat, price);
        players[seat].team.push(real);
      }
      // Solo se turnan en los lotes con puja, como en el motor.
      starter = other(starter);
    }
  });
}

interface Side {
  fighters: Fighter[];
  titular: Fighter | null;
}

const alive = (side: Side) => side.fighters.filter((fighter) => fighter.hp > 0);
const strongest = (fighters: Fighter[]) => [...fighters].sort((a, b) => totalOf(b) - totalOf(a))[0] ?? null;
const totalOf = (fighter: Fighter) => (fighter.pokemon as AuctionPokemon).total;

/** Lo que haría alguien razonable al caer su titular: sacar a su mejor Pokémon. */
function prepare(side: Side): void {
  if (!side.titular || side.titular.hp <= 0) side.titular = strongest(alive(side));
}

function choose(me: Side, rival: Side): BattleMove {
  const healing = availableMoves(me.titular!).find((id) => moveData(id)?.effect.healing);
  if (healing && hpShare(me.titular!) < HEAL_BELOW) return healing;
  return bestMove(me.titular!, rival.titular!);
}

function runBattle(players: [Player, Player], options: SimulationOptions, rng: Rng, result: SimulationResult): Seat {
  const sides = players.map((player) => ({
    fighters: player.team.map((one) => newFighter(one)),
    titular: null,
  })) as [Side, Side];
  for (const side of sides) side.titular = strongest(alive(side));
  enterBattle(sides[0].titular!, sides[1].titular!, 1);
  enterBattle(sides[1].titular!, sides[0].titular!, 2);

  // Combate seguido, como el motor (#57): el superviviente conserva sus stats y solo entra quien sustituye al caído.
  let calm = 0;
  for (;;) {
    const [a, b] = [sides[0].titular!, sides[1].titular!];
    calm++;
    const fighters = { 1: a, 2: b };
    const actions = resolveTurn(fighters, { 1: choose(sides[0], sides[1]), 2: choose(sides[1], sides[0]) }, rng, { criticals: options.criticals !== false });
    endOfTurn(fighters);
    result.criticals += actions.filter((action) => action.critical).length;
    if (a.hp > 0 && b.hp > 0) {
      if (calm < MAX_CALM_TURNS) continue;
      result.roundsAtLimit++;
      (roundLimitLoser(fighters, rng) === 1 ? a : b).hp = 0;
    }
    result.rounds++;
    result.turnsPerRound.push(calm);
    calm = 0;
    if (a.hp <= 0 && b.hp <= 0) {
      result.doubleKnockouts = (result.doubleKnockouts ?? 0) + 1;
      if (alive(sides[0]).length === 0 && alive(sides[1]).length === 0) return bothFallenLoser(fighters, rng) === 1 ? 1 : 0;
    }
    for (const side of sides) prepare(side);
    if (!sides[0].titular) return 1;
    if (!sides[1].titular) return 0;
    if (sides[0].titular !== a) enterBattle(sides[0].titular, sides[1].titular!, 1);
    if (sides[1].titular !== b) enterBattle(sides[1].titular, sides[0].titular!, 2);
  }
}

/** Juega una partida completa, de la subasta al último Pokémon. */
export function simulateGame(pool: readonly AuctionPokemon[], strategies: [Strategy, Strategy], options: SimulationOptions, rng: Rng): SimulationResult {
  const newPlayer = (strategy: Strategy): Player => ({ strategy, money: STARTING_MONEY, team: [] });
  const players: [Player, Player] = [newPlayer(strategies[0]), newPlayer(strategies[1])];
  const result: SimulationResult = {
    winner: 0,
    teamSizes: [0, 0],
    moneyLeft: [0, 0],
    bidTurns: 0,
    rounds: 0,
    turnsPerRound: [],
    roundsAtLimit: 0,
    traps: 0,
    criticals: 0,
    spent: [0, 0],
  };
  runAuction(pool, players, options, rng, result);
  result.teamSizes = [players[0].team.length, players[1].team.length];
  result.moneyLeft = [players[0].money, players[1].money];
  result.winner = runBattle(players, options, rng, result);
  return result;
}
