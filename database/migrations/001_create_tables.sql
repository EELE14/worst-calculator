/* Copyright (c) 2026 eele14. All Rights Reserved. */

CREATE TABLE segments (
    id           SERIAL PRIMARY KEY,
    segment_key  VARCHAR(100) UNIQUE NOT NULL,
    code         TEXT NOT NULL,
    next_segment VARCHAR(100),
    permitted    BOOLEAN NOT NULL DEFAULT TRUE,
    description  TEXT,
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ui_layouts (
    id         SERIAL PRIMARY KEY,
    layout_key VARCHAR(100) UNIQUE NOT NULL,
    html       TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE calculation_log (
    id               SERIAL PRIMARY KEY,
    input_expression TEXT NOT NULL,
    result           TEXT,
    segment_chain    TEXT[],
    total_duration_ms INTEGER,
    created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE heartbeat_log (
    id          SERIAL PRIMARY KEY,
    fired_at    TIMESTAMP DEFAULT NOW(),
    segment_key VARCHAR(100)
);

CREATE TABLE state_history (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(100) NOT NULL,
    value       TEXT,
    recorded_at TIMESTAMP DEFAULT NOW()
);

-- never add indexes hehe
