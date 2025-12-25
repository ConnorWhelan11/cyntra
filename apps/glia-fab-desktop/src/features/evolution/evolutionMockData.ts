/**
 * Mock data generators for Evolution page development
 * Generates realistic-looking evolution data with proper relationships
 */

import type {
  FitnessPoint,
  ParetoPoint,
  MutationNode,
  GenerationSummary,
  EvolutionStats,
  EvolutionState,
  GenomeParameter,
  AssetInfo,
} from "@/types";

// Deterministic pseudo-random for consistent mock data
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Generate short hash-like strings
function generateHash(seed: number): string {
  const chars = "0123456789abcdef";
  const rand = seededRandom(seed);
  return Array.from({ length: 8 }, () => chars[Math.floor(rand() * 16)]).join("");
}

// Mock genome parameters
export const MOCK_GENOME: GenomeParameter[] = [
  { name: "lighting.preset", value: "dramatic", type: "enum", options: ["natural", "dramatic", "soft", "high_contrast"] },
  { name: "layout.bay_size_m", value: 6.2, type: "number", min: 4, max: 10, step: 0.1 },
  { name: "furniture.density", value: 0.75, type: "number", min: 0, max: 1, step: 0.05 },
  { name: "materials.stone", value: "limestone_weathered", type: "enum", options: ["marble", "granite", "limestone_weathered", "concrete"] },
  { name: "materials.wood", value: "oak_dark", type: "enum", options: ["oak_light", "oak_dark", "walnut", "mahogany"] },
  { name: "ceiling.height_m", value: 4.5, type: "number", min: 3, max: 8, step: 0.5 },
  { name: "windows.style", value: "arched", type: "enum", options: ["rectangular", "arched", "circular", "clerestory"] },
  { name: "symmetry.factor", value: 0.85, type: "number", min: 0, max: 1, step: 0.05 },
];

// Generate fitness history with realistic convergence curve
export function generateFitnessHistory(maxGeneration: number): FitnessPoint[] {
  const points: FitnessPoint[] = [];
  const rand = seededRandom(42);

  // Logarithmic convergence curve with noise
  for (let gen = 1; gen <= maxGeneration; gen++) {
    // Base fitness follows log curve: starts low, converges to ~0.9
    const baseFitness = 0.15 + 0.75 * (1 - Math.exp(-gen / 15));
    // Add some noise and occasional jumps (mutations finding better solutions)
    const noise = (rand() - 0.5) * 0.08;
    const jump = rand() > 0.92 ? rand() * 0.1 : 0;
    const fitness = Math.min(0.98, Math.max(0.1, baseFitness + noise + jump));

    points.push({
      generation: gen,
      fitness: Math.round(fitness * 1000) / 1000,
      timestamp: Date.now() - (maxGeneration - gen) * 60000,
    });
  }

  return points;
}

// Generate Pareto frontier points
export function generateParetoFrontier(maxGeneration: number): ParetoPoint[] {
  const points: ParetoPoint[] = [];
  const rand = seededRandom(123);

  // Generate points across generations with clustering near optimal frontier
  for (let i = 0; i < maxGeneration * 3; i++) {
    const gen = Math.floor(rand() * maxGeneration) + 1;

    // Quality and speed are somewhat inversely correlated (tradeoff)
    const quality = 0.2 + rand() * 0.7;
    const baseSpeed = 0.3 + rand() * 0.6;
    // Add tradeoff: higher quality tends to mean lower speed
    const speed = Math.max(0.1, Math.min(0.95, baseSpeed - (quality - 0.5) * 0.3 + (rand() - 0.5) * 0.2));
    // Complexity is more independent
    const complexity = 0.2 + rand() * 0.6;

    // Fitness combines all three
    const fitness = (quality * 0.5 + speed * 0.3 + (1 - complexity) * 0.2);

    // Determine if Pareto optimal (simplified: high combined score)
    const isParetoOptimal = fitness > 0.65 && rand() > 0.7;

    points.push({
      id: `pareto-${i}`,
      generation: gen,
      quality: Math.round(quality * 1000) / 1000,
      speed: Math.round(speed * 1000) / 1000,
      complexity: Math.round(complexity * 1000) / 1000,
      fitness: Math.round(fitness * 1000) / 1000,
      isParetoOptimal,
      assetId: isParetoOptimal ? `asset-${gen}-${i}` : undefined,
      genomeHash: generateHash(i * 7919),
    });
  }

  return points;
}

// Generate mutation tree with branching structure
export function generateMutationTree(maxGeneration: number): MutationNode[] {
  const nodes: MutationNode[] = [];
  const rand = seededRandom(456);

  // Root node
  nodes.push({
    id: "mut-0",
    generation: 0,
    genomeHash: generateHash(0),
    parentId: undefined,
    mutationType: "initial",
    fitnessChange: 0,
    fitness: 0.15,
    timestamp: Date.now() - maxGeneration * 65000,
    children: [],
  });

  let nodeId = 1;

  for (let gen = 1; gen <= maxGeneration; gen++) {
    // 1-3 new variants per generation
    const variantCount = 1 + Math.floor(rand() * 3);

    for (let v = 0; v < variantCount; v++) {
      // Pick a parent from previous generations (bias toward recent, fit nodes)
      const eligibleParents = nodes.filter(n => n.generation < gen && n.generation >= gen - 5);
      if (eligibleParents.length === 0) continue;

      // Weight by fitness
      const totalFitness = eligibleParents.reduce((sum, n) => sum + n.fitness, 0);
      let threshold = rand() * totalFitness;
      let parent = eligibleParents[0];
      for (const p of eligibleParents) {
        threshold -= p.fitness;
        if (threshold <= 0) {
          parent = p;
          break;
        }
      }

      // Mutation type
      const mutTypes: MutationNode["mutationType"][] = ["mutation", "crossover", "selection"];
      const mutationType = mutTypes[Math.floor(rand() * mutTypes.length)];

      // Fitness change - usually small improvement, sometimes regression
      const fitnessChange = (rand() - 0.3) * 0.15;
      const newFitness = Math.min(0.98, Math.max(0.1, parent.fitness + fitnessChange));

      const node: MutationNode = {
        id: `mut-${nodeId}`,
        generation: gen,
        genomeHash: generateHash(nodeId * 31337),
        parentId: parent.id,
        mutationType,
        fitnessChange: Math.round(fitnessChange * 1000) / 1000,
        fitness: Math.round(newFitness * 1000) / 1000,
        timestamp: Date.now() - (maxGeneration - gen) * 60000,
        children: [],
      };

      // Update parent's children
      parent.children.push(node.id);
      nodes.push(node);
      nodeId++;
    }
  }

  return nodes;
}

// Generate mock asset info
function generateMockAsset(gen: number, fitness: number, seed: number): AssetInfo {
  const rand = seededRandom(seed);
  const categories = ["building", "furniture", "lighting", "structure", "vehicle"];
  const category = categories[Math.floor(rand() * categories.length)];

  return {
    id: `asset-gen${gen}-${seed}`,
    name: `${category.charAt(0).toUpperCase() + category.slice(1)} v${gen}.${Math.floor(rand() * 100)}`,
    category,
    generation: gen,
    fitness,
    passed: fitness > 0.6,
    thumbnailUrl: undefined, // Would be real URL in production
    vertices: Math.floor(5000 + rand() * 50000),
    materials: ["concrete", "glass", "metal"].slice(0, 1 + Math.floor(rand() * 3)),
    criticScores: {
      geometry: 0.5 + rand() * 0.5,
      alignment: 0.4 + rand() * 0.6,
      realism: 0.3 + rand() * 0.7,
      structural: 0.5 + rand() * 0.5,
    },
  };
}

// Generate generation gallery
export function generateGallery(maxGeneration: number): GenerationSummary[] {
  const gallery: GenerationSummary[] = [];
  const rand = seededRandom(789);
  const fitnessHistory = generateFitnessHistory(maxGeneration);

  // Show every 5th generation plus recent ones
  const shownGenerations = new Set<number>();
  for (let g = 1; g <= maxGeneration; g += 5) shownGenerations.add(g);
  for (let g = maxGeneration - 4; g <= maxGeneration; g++) if (g > 0) shownGenerations.add(g);

  for (const gen of Array.from(shownGenerations).sort((a, b) => a - b)) {
    const fitness = fitnessHistory.find(f => f.generation === gen)?.fitness ?? 0.5;
    const mutTypes: GenerationSummary["mutationType"][] = ["random", "crossover", "guided"];

    gallery.push({
      generation: gen,
      bestAsset: generateMockAsset(gen, fitness, gen * 1000),
      fitnessScore: fitness,
      parentGeneration: gen > 1 ? Math.max(1, gen - (1 + Math.floor(rand() * 4))) : undefined,
      mutationType: mutTypes[Math.floor(rand() * mutTypes.length)],
      timestamp: Date.now() - (maxGeneration - gen) * 60000,
      criticScores: {
        geometry: 0.5 + rand() * 0.5,
        alignment: 0.4 + rand() * 0.6,
        realism: 0.3 + rand() * 0.7,
        structural: 0.5 + rand() * 0.5,
      },
    });
  }

  return gallery;
}

// Generate evolution stats
export function generateStats(maxGeneration: number, isRunning: boolean): EvolutionStats {
  const fitnessHistory = generateFitnessHistory(maxGeneration);
  const bestFitness = Math.max(...fitnessHistory.map(f => f.fitness));
  const avgFitness = fitnessHistory.slice(-10).reduce((sum, f) => sum + f.fitness, 0) / 10;

  return {
    mutationRate: 0.12 + Math.random() * 0.08,
    convergenceSpeed: 8 + Math.floor(Math.random() * 12),
    diversityIndex: 0.4 + Math.random() * 0.4,
    generationSpeed: isRunning ? 1.5 + Math.random() * 2 : 0,
    eliteCount: 5 + Math.floor(Math.random() * 8),
    totalGenerations: maxGeneration,
    bestFitness,
    averageFitness: Math.round(avgFitness * 1000) / 1000,
  };
}

// Main generator function
export function generateMockEvolutionState(
  maxGeneration: number = 42,
  isRunning: boolean = false
): EvolutionState {
  return {
    currentGeneration: maxGeneration,
    isRunning,
    genome: [...MOCK_GENOME],
    fitnessHistory: generateFitnessHistory(maxGeneration),
    paretoFrontier: generateParetoFrontier(maxGeneration),
    mutationHistory: generateMutationTree(maxGeneration),
    generationGallery: generateGallery(maxGeneration),
    liveStats: generateStats(maxGeneration, isRunning),
  };
}

// Pre-generated state for immediate use
export const MOCK_EVOLUTION_STATE = generateMockEvolutionState(42, false);
