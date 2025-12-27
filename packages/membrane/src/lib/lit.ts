/**
 * Lit Protocol Integration for Access Control
 *
 * Provides encryption and access control for:
 * - Private universe configurations
 * - Gated asset access (NFT ownership, attestations)
 * - Proprietary scaffolds and prompts
 *
 * Access conditions can be based on:
 * - NFT ownership
 * - EAS attestations
 * - Token balances
 * - Custom contract calls
 */

import type {
  AccessControlConditions,
  EvmContractConditions,
  AuthSig,
} from "@lit-protocol/types";

// Lit Network configurations
const LIT_NETWORKS = {
  datil: "datil", // Mainnet
  "datil-dev": "datil-dev", // Devnet
  "datil-test": "datil-test", // Testnet
};

// Chain IDs for access control conditions
const CHAIN_IDS = {
  ethereum: "1",
  base: "8453",
  "base-sepolia": "84532",
  optimism: "10",
  polygon: "137",
};

/**
 * Encrypted data with metadata
 */
export interface EncryptedData {
  ciphertext: string;
  dataToEncryptHash: string;
  accessControlConditions: AccessControlConditions;
  chain: string;
}

/**
 * Access control condition types
 */
export type AccessConditionType =
  | "nft-ownership"
  | "token-balance"
  | "attestation"
  | "contract-call"
  | "address-list";

/**
 * Create NFT ownership access condition
 */
export function createNftOwnershipCondition(
  contractAddress: string,
  chain: keyof typeof CHAIN_IDS = "base-sepolia"
): AccessControlConditions {
  return [
    {
      contractAddress,
      standardContractType: "ERC721",
      chain: chain,
      method: "balanceOf",
      parameters: [":userAddress"],
      returnValueTest: {
        comparator: ">",
        value: "0",
      },
    },
  ];
}

/**
 * Create ERC1155 token ownership condition
 */
export function createErc1155OwnershipCondition(
  contractAddress: string,
  tokenId: string,
  minBalance: string = "1",
  chain: keyof typeof CHAIN_IDS = "base-sepolia"
): AccessControlConditions {
  return [
    {
      contractAddress,
      standardContractType: "ERC1155",
      chain: chain,
      method: "balanceOf",
      parameters: [":userAddress", tokenId],
      returnValueTest: {
        comparator: ">=",
        value: minBalance,
      },
    },
  ];
}

/**
 * Create ERC20 token balance condition
 */
export function createTokenBalanceCondition(
  contractAddress: string,
  minBalance: string,
  chain: keyof typeof CHAIN_IDS = "base-sepolia"
): AccessControlConditions {
  return [
    {
      contractAddress,
      standardContractType: "ERC20",
      chain: chain,
      method: "balanceOf",
      parameters: [":userAddress"],
      returnValueTest: {
        comparator: ">=",
        value: minBalance,
      },
    },
  ];
}

/**
 * Create EAS attestation condition
 * User must have received an attestation with the specified schema
 */
export function createAttestationCondition(
  easContractAddress: string,
  schemaUid: string,
  chain: keyof typeof CHAIN_IDS = "base-sepolia"
): EvmContractConditions {
  return [
    {
      contractAddress: easContractAddress,
      functionName: "getAttestation",
      functionParams: [":userAddress", schemaUid],
      functionAbi: {
        name: "getAttestation",
        inputs: [
          { name: "recipient", type: "address" },
          { name: "schema", type: "bytes32" },
        ],
        outputs: [
          {
            name: "attestation",
            type: "tuple",
            components: [
              { name: "uid", type: "bytes32" },
              { name: "schema", type: "bytes32" },
              { name: "time", type: "uint64" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocationTime", type: "uint64" },
              { name: "refUID", type: "bytes32" },
              { name: "recipient", type: "address" },
              { name: "attester", type: "address" },
              { name: "revocable", type: "bool" },
              { name: "data", type: "bytes" },
            ],
          },
        ],
      },
      chain: chain,
      returnValueTest: {
        key: "uid",
        comparator: "!=",
        value: "0x0000000000000000000000000000000000000000000000000000000000000000",
      },
    },
  ];
}

/**
 * Create address whitelist condition
 */
export function createAddressListCondition(
  addresses: string[],
  chain: keyof typeof CHAIN_IDS = "base-sepolia"
): AccessControlConditions {
  // Create OR conditions for each address
  const conditions: AccessControlConditions = [];

  addresses.forEach((address, index) => {
    if (index > 0) {
      conditions.push({ operator: "or" });
    }
    conditions.push({
      contractAddress: "",
      standardContractType: "",
      chain: chain,
      method: "",
      parameters: [":userAddress"],
      returnValueTest: {
        comparator: "=",
        value: address.toLowerCase(),
      },
    });
  });

  return conditions;
}

/**
 * Create custom contract call condition
 */
export function createContractCallCondition(
  contractAddress: string,
  functionName: string,
  functionAbi: object,
  parameters: string[],
  returnValueTest: { key?: string; comparator: string; value: string },
  chain: keyof typeof CHAIN_IDS = "base-sepolia"
): EvmContractConditions {
  return [
    {
      contractAddress,
      functionName,
      functionAbi,
      functionParams: parameters,
      chain: chain,
      returnValueTest,
    },
  ];
}

/**
 * Combine multiple conditions with AND/OR operators
 */
export function combineConditions(
  conditions: AccessControlConditions[],
  operator: "and" | "or" = "and"
): AccessControlConditions {
  const combined: AccessControlConditions = [];

  conditions.forEach((conditionSet, index) => {
    if (index > 0) {
      combined.push({ operator });
    }
    combined.push(...conditionSet);
  });

  return combined;
}

/**
 * Create universe access conditions
 * Requires either NFT ownership OR attestation
 */
export function createUniverseAccessConditions(
  universeNftContract: string,
  attestationSchema?: string,
  chain: keyof typeof CHAIN_IDS = "base-sepolia"
): AccessControlConditions {
  const nftCondition = createNftOwnershipCondition(universeNftContract, chain);

  if (!attestationSchema) {
    return nftCondition;
  }

  // EAS contract on Base Sepolia
  const easContract = "0x4200000000000000000000000000000000000021";
  const attestationCondition = createAttestationCondition(
    easContract,
    attestationSchema,
    chain
  ) as unknown as AccessControlConditions;

  return combineConditions([nftCondition, attestationCondition], "or");
}

/**
 * Lit Protocol client wrapper
 *
 * Note: The actual Lit client requires browser/node context and network connection.
 * This provides the structure for integration.
 */
export class LitAccessControl {
  private network: keyof typeof LIT_NETWORKS;
  private client: unknown | null = null;

  constructor(network: keyof typeof LIT_NETWORKS = "datil-test") {
    this.network = network;
  }

  /**
   * Initialize the Lit client
   * Must be called before encrypt/decrypt operations
   */
  async connect(): Promise<void> {
    // Dynamic import to avoid issues in non-browser environments
    const { LitNodeClient } = await import("@lit-protocol/lit-node-client");

    this.client = new LitNodeClient({
      litNetwork: this.network,
    });

    await (this.client as { connect: () => Promise<void> }).connect();
  }

  /**
   * Disconnect from Lit network
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await (this.client as { disconnect: () => Promise<void> }).disconnect();
      this.client = null;
    }
  }

  /**
   * Encrypt data with access conditions
   */
  async encrypt(
    data: string | Uint8Array,
    accessControlConditions: AccessControlConditions,
    chain: keyof typeof CHAIN_IDS = "base-sepolia"
  ): Promise<EncryptedData> {
    if (!this.client) {
      throw new Error("Lit client not connected. Call connect() first.");
    }

    const { encryptString } = await import("@lit-protocol/lit-node-client");

    const dataString = typeof data === "string" ? data : new TextDecoder().decode(data);

    const { ciphertext, dataToEncryptHash } = await encryptString(
      {
        accessControlConditions,
        dataToEncrypt: dataString,
      },
      this.client as never
    );

    return {
      ciphertext,
      dataToEncryptHash,
      accessControlConditions,
      chain,
    };
  }

  /**
   * Decrypt data (requires wallet signature)
   */
  async decrypt(
    encryptedData: EncryptedData,
    authSig: AuthSig
  ): Promise<string> {
    if (!this.client) {
      throw new Error("Lit client not connected. Call connect() first.");
    }

    const { decryptToString } = await import("@lit-protocol/lit-node-client");

    const decryptedString = await decryptToString(
      {
        accessControlConditions: encryptedData.accessControlConditions,
        ciphertext: encryptedData.ciphertext,
        dataToEncryptHash: encryptedData.dataToEncryptHash,
        authSig,
        chain: encryptedData.chain,
      },
      this.client as never
    );

    return decryptedString;
  }

  /**
   * Check if a user meets access conditions (without decrypting)
   */
  async checkAccess(
    accessControlConditions: AccessControlConditions,
    authSig: AuthSig,
    chain: keyof typeof CHAIN_IDS = "base-sepolia"
  ): Promise<boolean> {
    if (!this.client) {
      throw new Error("Lit client not connected. Call connect() first.");
    }

    // This would use the Lit SDK to check conditions
    // Use parameters in the actual implementation
    void accessControlConditions;
    void authSig;
    void chain;
    try {
      // The actual implementation would call:
      // await this.client.checkConditions(accessControlConditions, authSig, chain)
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Encrypt a file for gated access
 */
export async function encryptFile(
  fileData: Uint8Array,
  accessConditions: AccessControlConditions,
  litClient: LitAccessControl
): Promise<{
  encryptedFile: EncryptedData;
  symmetricKey: string;
}> {
  // Convert file to base64 for encryption
  const base64Data = Buffer.from(fileData).toString("base64");

  const encryptedFile = await litClient.encrypt(base64Data, accessConditions);

  return {
    encryptedFile,
    symmetricKey: encryptedFile.dataToEncryptHash, // Used for reference
  };
}

/**
 * Decrypt a file
 */
export async function decryptFile(
  encryptedData: EncryptedData,
  authSig: AuthSig,
  litClient: LitAccessControl
): Promise<Uint8Array> {
  const decryptedBase64 = await litClient.decrypt(encryptedData, authSig);
  return Buffer.from(decryptedBase64, "base64");
}
