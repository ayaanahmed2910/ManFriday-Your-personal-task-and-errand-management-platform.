-- Man Friday schema (MySQL 8). Idempotent: executed on every startup via spring.sql.init.mode=always.

CREATE TABLE IF NOT EXISTS app_user (
    id       BIGINT       NOT NULL AUTO_INCREMENT,
    username VARCHAR(80)  NOT NULL,
    password VARCHAR(120) NOT NULL,
    role     VARCHAR(20)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_app_user_username UNIQUE (username)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS app_user_skills (
    app_user_id BIGINT      NOT NULL,
    skill       VARCHAR(60),
    CONSTRAINT fk_skills_user FOREIGN KEY (app_user_id) REFERENCES app_user (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS job_request (
    id                BIGINT        NOT NULL AUTO_INCREMENT,
    client_user_id    BIGINT        NOT NULL,
    assistant_user_id BIGINT        NULL,
    category          VARCHAR(30)   NOT NULL,
    instructions      VARCHAR(2000) NOT NULL,
    status            VARCHAR(30)   NOT NULL,
    created_at        DATETIME(6),
    updated_at        DATETIME(6),
    version           BIGINT,
    PRIMARY KEY (id),
    INDEX idx_job_status (status),
    CONSTRAINT fk_job_client FOREIGN KEY (client_user_id) REFERENCES app_user (id),
    CONSTRAINT fk_job_assistant FOREIGN KEY (assistant_user_id) REFERENCES app_user (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- One row per assistant response (accept or reject) to a job
CREATE TABLE IF NOT EXISTS assignment (
    id                BIGINT      NOT NULL AUTO_INCREMENT,
    job_request_id    BIGINT      NOT NULL,
    assistant_user_id BIGINT      NOT NULL,
    status            VARCHAR(20) NOT NULL,
    created_at        DATETIME(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_assignment_job_assistant UNIQUE (job_request_id, assistant_user_id),
    CONSTRAINT fk_assignment_job FOREIGN KEY (job_request_id) REFERENCES job_request (id) ON DELETE CASCADE,
    CONSTRAINT fk_assignment_assistant FOREIGN KEY (assistant_user_id) REFERENCES app_user (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
