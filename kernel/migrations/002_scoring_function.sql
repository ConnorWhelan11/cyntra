-- ============================================================================
-- CYNTRA AGENT MEMORY IMPORTANCE SCORING FORMULA
-- ============================================================================
-- Adapted from Mira OS's scoring formula for run-based decay.
-- Single source of truth for memory importance calculation.
--
-- Key difference from Mira:
-- - Uses runs_at_creation/runs_at_last_access instead of activity_days
-- - Decay is per-run, not per-activity-day
--
-- FORMULA STRUCTURE:
-- 1. Expiration check: expires_at > 5 days past -> score = 0.0
-- 2. Run deltas: current_runs - runs_at_[creation|last_access]
-- 3. Momentum decay: access_count * 0.95^(runs_since_last_access)
-- 4. Access rate: effective_access_count / MAX(7, runs_since_creation)
-- 5. Value score: LN(1 + access_rate / 0.02) * 0.8
-- 6. Hub score: f(inbound_links) with diminishing returns after 10 links
-- 7. Mention score: f(mention_count) - explicit LLM references
-- 8. Newness boost: 2.0 decaying to 0 over 15 runs
-- 9. Raw score: value_score + hub_score + mention_score + newness_boost
-- 10. Recency boost: 1.0 / (1.0 + runs_since_last_access * 0.015)
-- 11. Temporal multiplier: happens_at proximity boost (calendar-based)
-- 12. Sigmoid transform: 1.0 / (1.0 + EXP(-(raw_score * recency * temporal - 2.0)))
--
-- CONSTANTS:
-- - BASELINE_ACCESS_RATE = 0.02 (1 access per 50 runs)
-- - MOMENTUM_DECAY_RATE = 0.95 (5% fade per run)
-- - MIN_AGE_RUNS = 7 (prevents spikes for new memories)
-- - SIGMOID_CENTER = 2.0 (maps average memories to ~0.5 importance)
-- - NEWNESS_BOOST_DECAY_RUNS = 15 (grace period for new memories)
-- - RECENCY_DECAY_RATE = 0.015 (half-life of ~67 runs)
-- ============================================================================

-- Function to calculate importance score for a single memory
CREATE OR REPLACE FUNCTION calculate_memory_importance(
    p_memory_id UUID,
    p_current_runs INTEGER
) RETURNS NUMERIC(4,3) AS $$
DECLARE
    mem RECORD;
    runs_since_creation INTEGER;
    runs_since_access INTEGER;
    effective_access_count NUMERIC;
    access_rate NUMERIC;
    value_score NUMERIC;
    hub_score NUMERIC;
    mention_score NUMERIC;
    newness_boost NUMERIC;
    raw_score NUMERIC;
    recency_boost NUMERIC;
    temporal_multiplier NUMERIC;
    expiration_multiplier NUMERIC;
    final_score NUMERIC;
    inbound_count INTEGER;
BEGIN
    -- Fetch memory
    SELECT * INTO mem FROM agent_memories WHERE id = p_memory_id;
    IF NOT FOUND THEN
        RETURN 0.0;
    END IF;

    -- Hard zero if expired more than 5 days ago
    IF mem.expires_at IS NOT NULL AND
       EXTRACT(EPOCH FROM (NOW() - mem.expires_at)) / 86400 > 5 THEN
        RETURN 0.0;
    END IF;

    -- Calculate run deltas
    runs_since_creation := GREATEST(0, p_current_runs - COALESCE(mem.runs_at_creation, 0));
    runs_since_access := GREATEST(0, p_current_runs - COALESCE(mem.runs_at_last_access, mem.runs_at_creation, 0));

    -- VALUE SCORE: access rate with momentum decay
    effective_access_count := mem.access_count * POWER(0.95, runs_since_access);
    access_rate := effective_access_count / GREATEST(7, runs_since_creation);
    value_score := LN(1 + access_rate / 0.02) * 0.8;

    -- HUB SCORE: diminishing returns after 10 links
    inbound_count := jsonb_array_length(COALESCE(mem.inbound_links, '[]'::jsonb));
    IF inbound_count = 0 THEN
        hub_score := 0.0;
    ELSIF inbound_count <= 10 THEN
        hub_score := inbound_count * 0.04;
    ELSE
        hub_score := 0.4 + (inbound_count - 10) * 0.02 / (1 + (inbound_count - 10) * 0.05);
    END IF;

    -- MENTION SCORE: explicit LLM references
    IF mem.mention_count = 0 THEN
        mention_score := 0.0;
    ELSIF mem.mention_count <= 5 THEN
        mention_score := mem.mention_count * 0.08;
    ELSE
        mention_score := 0.4 + LN(1 + (mem.mention_count - 5)) * 0.1;
    END IF;

    -- NEWNESS BOOST: grace period for new memories (decays over 15 runs)
    newness_boost := GREATEST(0.0, 2.0 - (runs_since_creation * 0.133));

    -- RAW SCORE
    raw_score := value_score + hub_score + mention_score + newness_boost;

    -- RECENCY BOOST: gentle transition to cold storage
    recency_boost := 1.0 / (1.0 + runs_since_access * 0.015);

    -- TEMPORAL MULTIPLIER: happens_at proximity boost (calendar-based)
    IF mem.happens_at IS NOT NULL THEN
        IF mem.happens_at < NOW() THEN
            -- Event has passed: 45-day gradual decay (0.8 -> 0.4)
            IF EXTRACT(EPOCH FROM (NOW() - mem.happens_at)) / 86400 <= 45 THEN
                temporal_multiplier := 0.4 * (1.0 - (EXTRACT(EPOCH FROM (NOW() - mem.happens_at)) / 86400) / 45.0) + 0.4;
            ELSE
                temporal_multiplier := 0.4;
            END IF;
        ELSE
            -- Event upcoming: boost based on proximity
            IF EXTRACT(EPOCH FROM (mem.happens_at - NOW())) / 86400 <= 1 THEN
                temporal_multiplier := 2.0;
            ELSIF EXTRACT(EPOCH FROM (mem.happens_at - NOW())) / 86400 <= 7 THEN
                temporal_multiplier := 1.5;
            ELSIF EXTRACT(EPOCH FROM (mem.happens_at - NOW())) / 86400 <= 14 THEN
                temporal_multiplier := 1.2;
            ELSE
                temporal_multiplier := 1.0;
            END IF;
        END IF;
    ELSE
        temporal_multiplier := 1.0;
    END IF;

    -- EXPIRATION TRAILOFF: 5-day crash-out after expires_at
    IF mem.expires_at IS NOT NULL AND mem.expires_at < NOW() THEN
        expiration_multiplier := GREATEST(0.0, 1.0 - (EXTRACT(EPOCH FROM (NOW() - mem.expires_at)) / 86400) / 5.0);
    ELSE
        expiration_multiplier := 1.0;
    END IF;

    -- SIGMOID TRANSFORM
    final_score := 1.0 / (1.0 + EXP(-(raw_score * recency_boost * temporal_multiplier * expiration_multiplier - 2.0)));

    RETURN ROUND(final_score::NUMERIC, 3);
END;
$$ LANGUAGE plpgsql;

-- Function to bulk recalculate importance scores for an agent
CREATE OR REPLACE FUNCTION recalculate_agent_memory_scores(p_agent_id TEXT)
RETURNS INTEGER AS $$
DECLARE
    current_runs INTEGER;
    updated_count INTEGER;
BEGIN
    -- Get current run count for agent
    SELECT total_runs INTO current_runs
    FROM agent_activity_counters
    WHERE agent_id = p_agent_id;

    current_runs := COALESCE(current_runs, 0);

    -- Update all non-archived memories for this agent
    UPDATE agent_memories m
    SET importance_score = calculate_memory_importance(m.id, current_runs),
        updated_at = NOW()
    WHERE m.agent_id = p_agent_id
      AND m.is_archived = FALSE;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to archive memories below threshold
CREATE OR REPLACE FUNCTION archive_stale_memories(
    p_agent_id TEXT,
    p_threshold NUMERIC DEFAULT 0.001
)
RETURNS INTEGER AS $$
DECLARE
    archived_count INTEGER;
BEGIN
    UPDATE agent_memories
    SET is_archived = TRUE,
        archived_at = NOW(),
        updated_at = NOW()
    WHERE agent_id = p_agent_id
      AND importance_score <= p_threshold
      AND is_archived = FALSE;

    GET DIAGNOSTICS archived_count = ROW_COUNT;
    RETURN archived_count;
END;
$$ LANGUAGE plpgsql;
