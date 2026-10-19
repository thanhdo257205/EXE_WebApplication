-- Technical metadata only; game data is not yet available.
CREATE TABLE application_metadata (
    metadata_key VARCHAR(100) PRIMARY KEY,
    metadata_value VARCHAR(255) NOT NULL
);
INSERT INTO application_metadata (metadata_key, metadata_value)
VALUES ('application', 'EXE_WebApplication');
