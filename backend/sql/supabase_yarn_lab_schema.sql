-- YarnLAB tables only (PostgreSQL / Supabase). Safe to run on a project that already has
-- production QMS tables: this script creates only lab_* objects and does not reference them.

CREATE TABLE IF NOT EXISTS lab_trials (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lab_benchmarks (
    id SERIAL PRIMARY KEY,
    trial_id INTEGER NOT NULL REFERENCES lab_trials(id) ON DELETE CASCADE,
    dept_id TEXT NOT NULL,
    target DOUBLE PRECISION NOT NULL,
    tolerance DOUBLE PRECISION NOT NULL,
    CONSTRAINT uq_lab_bench UNIQUE (trial_id, dept_id)
);

CREATE INDEX IF NOT EXISTS ix_lab_benchmarks_trial_id ON lab_benchmarks(trial_id);

CREATE TABLE IF NOT EXISTS lab_samples (
    id SERIAL PRIMARY KEY,
    trial_id INTEGER NOT NULL REFERENCES lab_trials(id) ON DELETE CASCADE,
    dept_id TEXT NOT NULL,
    readings_json TEXT NOT NULL,
    mean_hank DOUBLE PRECISION NOT NULL,
    cv_pct DOUBLE PRECISION,
    readings_count INTEGER NOT NULL,
    avg_weight DOUBLE PRECISION,
    sample_length DOUBLE PRECISION NOT NULL,
    frame_number INTEGER,
    notes TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_lab_samples_trial_id ON lab_samples(trial_id);
CREATE INDEX IF NOT EXISTS ix_lab_samples_dept_id ON lab_samples(dept_id);
CREATE INDEX IF NOT EXISTS ix_lab_samples_timestamp ON lab_samples(timestamp);

CREATE TABLE IF NOT EXISTS lab_rsb_cans (
    id SERIAL PRIMARY KEY,
    trial_id INTEGER NOT NULL REFERENCES lab_trials(id) ON DELETE CASCADE,
    slot INTEGER NOT NULL,
    hank_value DOUBLE PRECISION,
    notes TEXT,
    is_perfect BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    readings_json TEXT,
    readings_count INTEGER NOT NULL DEFAULT 0,
    mean_hank DOUBLE PRECISION,
    cv_pct DOUBLE PRECISION,
    sample_length DOUBLE PRECISION NOT NULL DEFAULT 6.0,
    CONSTRAINT uq_rsb_trial_slot UNIQUE (trial_id, slot)
);

CREATE INDEX IF NOT EXISTS ix_lab_rsb_cans_trial_id ON lab_rsb_cans(trial_id);

CREATE TABLE IF NOT EXISTS lab_simplex_bobbins (
    id SERIAL PRIMARY KEY,
    trial_id INTEGER NOT NULL REFERENCES lab_trials(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    hank_value DOUBLE PRECISION,
    notes TEXT,
    verified_same_hank BOOLEAN NOT NULL DEFAULT FALSE,
    doff_minutes INTEGER NOT NULL DEFAULT 180,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    readings_json TEXT,
    readings_count INTEGER NOT NULL DEFAULT 0,
    mean_hank DOUBLE PRECISION,
    cv_pct DOUBLE PRECISION,
    sample_length DOUBLE PRECISION NOT NULL DEFAULT 6.0
);

CREATE INDEX IF NOT EXISTS ix_lab_simplex_bobbins_trial_id ON lab_simplex_bobbins(trial_id);

CREATE TABLE IF NOT EXISTS lab_simplex_inputs (
    id SERIAL PRIMARY KEY,
    bobbin_id INTEGER NOT NULL REFERENCES lab_simplex_bobbins(id) ON DELETE CASCADE,
    rsb_can_id INTEGER NOT NULL REFERENCES lab_rsb_cans(id) ON DELETE CASCADE,
    CONSTRAINT uq_simplex_input UNIQUE (bobbin_id, rsb_can_id)
);

CREATE INDEX IF NOT EXISTS ix_lab_simplex_inputs_bobbin_id ON lab_simplex_inputs(bobbin_id);
CREATE INDEX IF NOT EXISTS ix_lab_simplex_inputs_rsb_can_id ON lab_simplex_inputs(rsb_can_id);

CREATE TABLE IF NOT EXISTS lab_ringframe_cops (
    id SERIAL PRIMARY KEY,
    trial_id INTEGER NOT NULL REFERENCES lab_trials(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    hank_value DOUBLE PRECISION,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    readings_json TEXT,
    readings_count INTEGER NOT NULL DEFAULT 0,
    mean_hank DOUBLE PRECISION,
    cv_pct DOUBLE PRECISION,
    sample_length DOUBLE PRECISION NOT NULL DEFAULT 120.0
);

CREATE INDEX IF NOT EXISTS ix_lab_ringframe_cops_trial_id ON lab_ringframe_cops(trial_id);

CREATE TABLE IF NOT EXISTS lab_ringframe_inputs (
    id SERIAL PRIMARY KEY,
    cop_id INTEGER NOT NULL REFERENCES lab_ringframe_cops(id) ON DELETE CASCADE,
    simplex_bobbin_id INTEGER NOT NULL REFERENCES lab_simplex_bobbins(id) ON DELETE CASCADE,
    CONSTRAINT uq_ringframe_input UNIQUE (cop_id, simplex_bobbin_id)
);

CREATE INDEX IF NOT EXISTS ix_lab_ringframe_inputs_cop_id ON lab_ringframe_inputs(cop_id);
CREATE INDEX IF NOT EXISTS ix_lab_ringframe_inputs_simplex_bobbin_id ON lab_ringframe_inputs(simplex_bobbin_id);
