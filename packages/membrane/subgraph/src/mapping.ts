import {
  BigInt,
  Bytes,
  ethereum,
  json,
  log,
} from "@graphprotocol/graph-ts";
import {
  Attested as AttestedEvent,
  Revoked as RevokedEvent,
  EAS,
} from "../generated/EAS/EAS";
import { Registered as SchemaRegisteredEvent } from "../generated/EAS/SchemaRegistry";
import {
  RunAttestation,
  Schema,
  WorldStats,
  DailyStats,
  Attester,
} from "../generated/schema";

// RunReceipt schema UID - must match the registered schema
const RUN_RECEIPT_SCHEMA_UID = Bytes.fromHexString(
  "0x0000000000000000000000000000000000000000000000000000000000000000" // Replace with actual schema UID
);

/**
 * Handle new attestation events
 */
export function handleAttested(event: AttestedEvent): void {
  const uid = event.params.uid;
  const schemaId = event.params.schema;

  // Only process RunReceipt attestations
  if (!schemaId.equals(RUN_RECEIPT_SCHEMA_UID)) {
    return;
  }

  // Fetch full attestation data from contract
  const easContract = EAS.bind(event.address);
  const attestationResult = easContract.try_getAttestation(uid);

  if (attestationResult.reverted) {
    log.warning("Failed to fetch attestation {}", [uid.toHexString()]);
    return;
  }

  const attestation = attestationResult.value;

  // Create or update RunAttestation entity
  let entity = new RunAttestation(uid.toHexString());
  entity.schemaId = schemaId;
  entity.attester = attestation.attester;
  entity.recipient = attestation.recipient;
  entity.timestamp = attestation.time;
  entity.expirationTime = attestation.expirationTime;
  entity.revocable = attestation.revocable;
  entity.revocationTime = attestation.revocationTime;
  entity.refUID = attestation.refUID;
  entity.data = attestation.data;
  entity.blockNumber = event.block.number;
  entity.txHash = event.transaction.hash;

  // Decode RunReceipt data
  // Schema: string runId, string worldId, string commitHash, string artifactsCid, bool passed, bytes32 verdictHash
  const decoded = decodeRunReceipt(attestation.data);
  if (decoded) {
    entity.runId = decoded.runId;
    entity.worldId = decoded.worldId;
    entity.commitHash = decoded.commitHash;
    entity.artifactsCid = decoded.artifactsCid;
    entity.passed = decoded.passed;
    entity.verdictHash = decoded.verdictHash;

    // Update world stats
    updateWorldStats(decoded.worldId, decoded.passed, event.block.timestamp, entity);

    // Update daily stats
    updateDailyStats(event.block.timestamp, decoded.worldId);
  }

  // Update attester stats
  updateAttesterStats(attestation.attester, entity.passed, event.block.timestamp);

  entity.save();
}

/**
 * Handle attestation revocation
 */
export function handleRevoked(event: RevokedEvent): void {
  const uid = event.params.uid;
  const entity = RunAttestation.load(uid.toHexString());

  if (entity) {
    entity.revocationTime = event.block.timestamp;
    entity.save();

    // Update world stats if we had decoded the attestation
    if (entity.worldId && entity.passed !== null) {
      const worldStats = WorldStats.load(entity.worldId!);
      if (worldStats) {
        worldStats.totalRuns = worldStats.totalRuns.minus(BigInt.fromI32(1));
        if (entity.passed) {
          worldStats.passedRuns = worldStats.passedRuns.minus(BigInt.fromI32(1));
        } else {
          worldStats.failedRuns = worldStats.failedRuns.minus(BigInt.fromI32(1));
        }
        worldStats.save();
      }
    }
  }
}

/**
 * Handle schema registration
 */
export function handleSchemaRegistered(event: SchemaRegisteredEvent): void {
  const uid = event.params.uid;

  let schema = new Schema(uid.toHexString());
  schema.schema = ""; // Would need to fetch from contract
  schema.resolver = event.params.resolver;
  schema.revocable = event.params.revocable;
  schema.attestationCount = BigInt.fromI32(0);
  schema.timestamp = event.block.timestamp;
  schema.save();
}

/**
 * Decode RunReceipt ABI-encoded data
 */
class DecodedRunReceipt {
  runId: string;
  worldId: string;
  commitHash: string;
  artifactsCid: string;
  passed: boolean;
  verdictHash: Bytes;
}

function decodeRunReceipt(data: Bytes): DecodedRunReceipt | null {
  // ABI decode: (string, string, string, string, bool, bytes32)
  const decoded = ethereum.decode(
    "(string,string,string,string,bool,bytes32)",
    data
  );

  if (!decoded) {
    log.warning("Failed to decode RunReceipt data", []);
    return null;
  }

  const tuple = decoded.toTuple();
  const result = new DecodedRunReceipt();
  result.runId = tuple[0].toString();
  result.worldId = tuple[1].toString();
  result.commitHash = tuple[2].toString();
  result.artifactsCid = tuple[3].toString();
  result.passed = tuple[4].toBoolean();
  result.verdictHash = tuple[5].toBytes();

  return result;
}

/**
 * Update world aggregate statistics
 */
function updateWorldStats(
  worldId: string,
  passed: boolean,
  timestamp: BigInt,
  attestation: RunAttestation
): void {
  let stats = WorldStats.load(worldId);

  if (!stats) {
    stats = new WorldStats(worldId);
    stats.totalRuns = BigInt.fromI32(0);
    stats.passedRuns = BigInt.fromI32(0);
    stats.failedRuns = BigInt.fromI32(0);
    stats.firstRunAt = timestamp;
  }

  stats.totalRuns = stats.totalRuns.plus(BigInt.fromI32(1));
  if (passed) {
    stats.passedRuns = stats.passedRuns.plus(BigInt.fromI32(1));
    stats.latestPassingAttestation = attestation.id;
  } else {
    stats.failedRuns = stats.failedRuns.plus(BigInt.fromI32(1));
  }
  stats.lastRunAt = timestamp;

  stats.save();
}

/**
 * Update daily statistics
 */
function updateDailyStats(timestamp: BigInt, worldId: string): void {
  // Calculate day start (UTC midnight)
  const daySeconds = BigInt.fromI32(86400);
  const dayStart = timestamp.div(daySeconds).times(daySeconds);
  const dateId = dayStart.toString();

  let stats = DailyStats.load(dateId);

  if (!stats) {
    stats = new DailyStats(dateId);
    stats.date = dayStart;
    stats.totalRuns = BigInt.fromI32(0);
    stats.passedRuns = BigInt.fromI32(0);
    stats.uniqueWorlds = BigInt.fromI32(0);
  }

  stats.totalRuns = stats.totalRuns.plus(BigInt.fromI32(1));

  stats.save();
}

/**
 * Update attester reputation
 */
function updateAttesterStats(
  attesterAddress: Bytes,
  passed: boolean | null,
  timestamp: BigInt
): void {
  const id = attesterAddress.toHexString();
  let attester = Attester.load(id);

  if (!attester) {
    attester = new Attester(id);
    attester.attestationCount = BigInt.fromI32(0);
    attester.passedCount = BigInt.fromI32(0);
    attester.passRate = BigInt.fromI32(0);
    attester.firstAttestationAt = timestamp;
  }

  attester.attestationCount = attester.attestationCount.plus(BigInt.fromI32(1));
  if (passed === true) {
    attester.passedCount = attester.passedCount.plus(BigInt.fromI32(1));
  }

  // Calculate pass rate (scaled by 10000 for precision)
  if (attester.attestationCount.gt(BigInt.fromI32(0))) {
    attester.passRate = attester.passedCount
      .times(BigInt.fromI32(10000))
      .div(attester.attestationCount);
  }

  attester.lastAttestationAt = timestamp;
  attester.save();
}
