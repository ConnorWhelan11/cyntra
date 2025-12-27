-- Cyntra Agent Memory System Schema
-- Adapted from Mira OS LT_Memory architecture for agent swarm context
-- Updated: 2025-12-21
--
-- Run this to create agent memory tables:
-- psql -U cyntra_admin -h localhost -d cyntra_db -f migrations/001_memory_system.sql
--
-- =====================================================================
-- KEY ADAPTATIONS FROM MIRA
-- =====================================================================
--
-- 1. user_id → agent_id (toolchain: codex, claude, opencode, crush)
-- 2. activity_days → runs_at_creation/runs_at_last_access (agent runs, not calendar)
-- 3. Added scope column (individual, collective, world)
-- 4. Added agent-specific memory types (pattern, failure, dynamic, playbook, frontier)
-- 5. Added agent-specific link types (improves_on, requires, repairs)
-- 6. Added world_id for Fab World scoped memories
-- 7. Added issue_tags and file_paths for agent context
--
-- =====================================================================
-- EXTENSIONS
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================================
-- AGENT MEMORIES TABLE (core long-term memory storage)
-- =====================================================================

CREATE TABLE IF NOT EXISTS agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(50) NOT NULL,  -- codex, claude, opencode, crush
    text TEXT NOT NULL,
    embedding vector(768),  -- mdbr-leaf-ir-asym embeddings for semantic search
    importance_score NUMERIC(5,3) NOT NULL DEFAULT 0.5 CHECK (importance_score >= 0 AND importance_score <= 1),

    -- Memory classification
    memory_type VARCHAR(20) NOT NULL CHECK (memory_type IN (
        'pattern', 'failure', 'dynamic', 'context', 'playbook', 'frontier'
    )),
    scope VARCHAR(20) NOT NULL DEFAULT 'individual' CHECK (scope IN (
        'individual', 'collective', 'world'
    )),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_accessed TIMESTAMP WITH TIME ZONE,
    happens_at TIMESTAMP WITH TIME ZONE,

    -- Access tracking
    access_count INTEGER NOT NULL DEFAULT 0,
    mention_count INTEGER NOT NULL DEFAULT 0,  -- Explicit LLM references

    -- Link tracking arrays for efficient hub scoring
    inbound_links JSONB DEFAULT '[]'::jsonb,  -- [{source_id, link_type, confidence, reasoning, created_at}, ...]
    outbound_links JSONB DEFAULT '[]'::jsonb, -- [{target_id, link_type, confidence, reasoning, created_at}, ...]

    -- Metadata
    confidence NUMERIC(3,2) DEFAULT 0.9 CHECK (confidence >= 0 AND confidence <= 1),
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMP WITH TIME ZONE,

    -- Refinement tracking
    is_refined BOOLEAN DEFAULT FALSE,
    last_refined_at TIMESTAMP WITH TIME ZONE,
    refinement_rejection_count INTEGER DEFAULT 0,

    -- Run-based activity snapshots (agent context, not calendar)
    runs_at_creation INT,
    runs_at_last_access INT,

    -- Agent-specific fields
    run_id VARCHAR(100),  -- Run that created this memory
    world_id VARCHAR(100),  -- Fab World context (for scope=world)
    issue_tags TEXT[],  -- Issue labels/tags for retrieval
    file_paths TEXT[]  -- Referenced file paths
);

COMMENT ON TABLE agent_memories IS 'Long-term memory storage for Cyntra agents with embeddings, links, and run-based decay';
COMMENT ON COLUMN agent_memories.agent_id IS 'Toolchain identifier (codex, claude, opencode, crush)';
COMMENT ON COLUMN agent_memories.text IS 'Memory content text';
COMMENT ON COLUMN agent_memories.embedding IS 'mdbr-leaf-ir-asym 768-dimensional embedding for semantic similarity search';
COMMENT ON COLUMN agent_memories.importance_score IS 'Memory importance (0.0-1.0) calculated via decay formula';
COMMENT ON COLUMN agent_memories.memory_type IS 'Memory classification: pattern, failure, dynamic, context, playbook, frontier';
COMMENT ON COLUMN agent_memories.scope IS 'Visibility scope: individual (agent-private), collective (shared), world (fab-specific)';
COMMENT ON COLUMN agent_memories.happens_at IS 'When the memory event occurred (for temporal context)';
COMMENT ON COLUMN agent_memories.inbound_links IS 'JSONB array of memories that link TO this memory';
COMMENT ON COLUMN agent_memories.outbound_links IS 'JSONB array of memories this memory links TO';
COMMENT ON COLUMN agent_memories.refinement_rejection_count IS 'Times marked do_nothing during refinement (exclude after 3)';
COMMENT ON COLUMN agent_memories.runs_at_creation IS 'Agent total runs when memory was created (snapshot for decay)';
COMMENT ON COLUMN agent_memories.runs_at_last_access IS 'Agent total runs when memory was last accessed (snapshot for recency)';
COMMENT ON COLUMN agent_memories.run_id IS 'Run identifier that created this memory';
COMMENT ON COLUMN agent_memories.world_id IS 'Fab World identifier (for scope=world memories)';
COMMENT ON COLUMN agent_memories.issue_tags IS 'Issue labels/tags for tag-based retrieval';
COMMENT ON COLUMN agent_memories.file_paths IS 'Referenced file paths for file-based retrieval';

-- Set compression for large text columns
ALTER TABLE agent_memories ALTER COLUMN text SET COMPRESSION lz4;

-- =====================================================================
-- MEMORY INDEXES
-- =====================================================================

-- Agent ID index for agent-specific queries (most common filter)
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_id ON agent_memories(agent_id);

-- Scope index for collective/world memory queries
CREATE INDEX IF NOT EXISTS idx_agent_memories_scope ON agent_memories(scope);

-- Memory type index for type-specific retrieval
CREATE INDEX IF NOT EXISTS idx_agent_memories_type ON agent_memories(memory_type);

-- Composite index for agent + scope queries (common pattern)
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_scope ON agent_memories(agent_id, scope);

-- Issue tags GIN index for tag-based retrieval
CREATE INDEX IF NOT EXISTS idx_agent_memories_tags ON agent_memories USING gin(issue_tags);

-- File paths GIN index for file-based retrieval
CREATE INDEX IF NOT EXISTS idx_agent_memories_files ON agent_memories USING gin(file_paths);

-- World ID index for Fab World scoped queries
CREATE INDEX IF NOT EXISTS idx_agent_memories_world ON agent_memories(world_id) WHERE world_id IS NOT NULL;

-- HNSW vector index for semantic similarity search
-- Using HNSW instead of IVFFlat for better recall/performance trade-off
-- m=16, ef_construction=64 are good defaults for most workloads
CREATE INDEX IF NOT EXISTS idx_agent_memories_embedding_hnsw
    ON agent_memories USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMENT ON INDEX idx_agent_memories_agent_id IS 'B-tree index for agent-specific queries';
COMMENT ON INDEX idx_agent_memories_scope IS 'B-tree index for scope filtering (individual/collective/world)';
COMMENT ON INDEX idx_agent_memories_type IS 'B-tree index for memory type filtering';
COMMENT ON INDEX idx_agent_memories_agent_scope IS 'Composite index for agent+scope queries';
COMMENT ON INDEX idx_agent_memories_tags IS 'GIN index for tag-based retrieval';
COMMENT ON INDEX idx_agent_memories_files IS 'GIN index for file-path-based retrieval';
COMMENT ON INDEX idx_agent_memories_world IS 'Partial index for Fab World scoped memories';
COMMENT ON INDEX idx_agent_memories_embedding_hnsw IS 'HNSW index for fast cosine similarity search';

-- =====================================================================
-- AGENT ACTIVITY COUNTERS (run-based activity tracking)
-- =====================================================================

CREATE TABLE IF NOT EXISTS agent_activity_counters (
    agent_id VARCHAR(50) PRIMARY KEY,
    total_runs INT DEFAULT 0,
    last_run_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agent_activity_counters IS 'Track total runs per agent for activity-based importance decay';
COMMENT ON COLUMN agent_activity_counters.total_runs IS 'Cumulative run count for this agent (incremented on each run)';
COMMENT ON COLUMN agent_activity_counters.last_run_at IS 'Timestamp of most recent run';

-- =====================================================================
-- MEMORY EXTRACTION BATCHES (async extraction tracking)
-- =====================================================================

CREATE TABLE IF NOT EXISTS memory_extraction_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id TEXT NOT NULL,  -- LLM provider batch ID
    custom_id TEXT NOT NULL,
    agent_id VARCHAR(50) NOT NULL,
    run_id VARCHAR(100) NOT NULL,
    request_payload JSONB NOT NULL,
    run_metadata JSONB,
    memory_context JSONB,
    status TEXT NOT NULL CHECK (status IN ('submitted', 'processing', 'completed', 'failed', 'expired', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    result_url TEXT,
    result_payload JSONB,
    extracted_memories JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    processing_time_ms INTEGER,
    tokens_used INTEGER
);

COMMENT ON TABLE memory_extraction_batches IS 'Batch extraction job tracking for async memory extraction via LLM batch API';
COMMENT ON COLUMN memory_extraction_batches.batch_id IS 'LLM provider batch API batch ID';
COMMENT ON COLUMN memory_extraction_batches.custom_id IS 'Custom ID for batch request tracking';
COMMENT ON COLUMN memory_extraction_batches.run_id IS 'Cyntra run identifier';
COMMENT ON COLUMN memory_extraction_batches.status IS 'Batch processing status';
COMMENT ON COLUMN memory_extraction_batches.extracted_memories IS 'JSON array of extracted memories from batch response';

-- Index for batch status polling
CREATE INDEX IF NOT EXISTS idx_extraction_batches_status ON memory_extraction_batches(status)
    WHERE status IN ('submitted', 'processing');

-- Index for agent-specific queries
CREATE INDEX IF NOT EXISTS idx_extraction_batches_agent ON memory_extraction_batches(agent_id);

-- =====================================================================
-- MEMORY LINKING BATCHES (relationship classification tracking)
-- =====================================================================

CREATE TABLE IF NOT EXISTS memory_linking_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id TEXT NOT NULL,  -- LLM provider batch ID
    agent_id VARCHAR(50) NOT NULL,
    request_payload JSONB NOT NULL,
    input_data JSONB NOT NULL,
    items_submitted INTEGER NOT NULL,
    items_completed INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('submitted', 'processing', 'completed', 'failed', 'expired', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    result_payload JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    processing_time_ms INTEGER,
    tokens_used INTEGER,
    links_created INTEGER DEFAULT 0,
    conflicts_flagged INTEGER DEFAULT 0
);

COMMENT ON TABLE memory_linking_batches IS 'Batch tracking for relationship classification between memories';
COMMENT ON COLUMN memory_linking_batches.input_data IS 'Input data for batch processing (memory pairs, etc.)';
COMMENT ON COLUMN memory_linking_batches.items_submitted IS 'Number of memory pairs in batch';
COMMENT ON COLUMN memory_linking_batches.links_created IS 'Number of memory links created from batch results';
COMMENT ON COLUMN memory_linking_batches.conflicts_flagged IS 'Number of conflicting memories detected';

-- Index for batch status polling
CREATE INDEX IF NOT EXISTS idx_linking_batches_status ON memory_linking_batches(status)
    WHERE status IN ('submitted', 'processing');

-- Index for agent-specific queries
CREATE INDEX IF NOT EXISTS idx_linking_batches_agent ON memory_linking_batches(agent_id);

-- =====================================================================
-- TRIGGERS
-- =====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_agent_memories_updated_at ON agent_memories;
CREATE TRIGGER update_agent_memories_updated_at
BEFORE UPDATE ON agent_memories
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- HELPER FUNCTIONS
-- =====================================================================

-- Function to increment agent run count and return new total
CREATE OR REPLACE FUNCTION increment_agent_runs(p_agent_id VARCHAR(50))
RETURNS INT AS $$
DECLARE
    new_count INT;
BEGIN
    INSERT INTO agent_activity_counters (agent_id, total_runs, last_run_at)
    VALUES (p_agent_id, 1, NOW())
    ON CONFLICT (agent_id) DO UPDATE
        SET total_runs = agent_activity_counters.total_runs + 1,
            last_run_at = NOW()
    RETURNING total_runs INTO new_count;

    RETURN new_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_agent_runs IS 'Increment run counter for agent and return new total';

-- Function to get current agent run count
CREATE OR REPLACE FUNCTION get_agent_run_count(p_agent_id VARCHAR(50))
RETURNS INT AS $$
DECLARE
    count INT;
BEGIN
    SELECT COALESCE(total_runs, 0) INTO count
    FROM agent_activity_counters
    WHERE agent_id = p_agent_id;

    RETURN count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_agent_run_count IS 'Get current run count for agent';
