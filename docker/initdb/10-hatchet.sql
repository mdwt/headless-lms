-- Runs on first postgres volume creation only; on existing volumes create the
-- database manually: docker exec headless-lms-postgres createdb -U postgres hatchet
CREATE DATABASE hatchet;
