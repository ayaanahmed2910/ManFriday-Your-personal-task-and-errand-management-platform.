package com.manfriday.job;

import com.manfriday.user.AppUser;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "assignment",
        uniqueConstraints = @UniqueConstraint(columnNames = {"job_request_id", "assistant_user_id"}))
public class Assignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // One row per assistant response; a job can collect several rejections but only one acceptance
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "job_request_id", nullable = false)
    private JobRequest job;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "assistant_user_id", nullable = false)
    private AppUser assistant;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ResponseStatus status;

    private Instant createdAt;

    @PrePersist
    public void prePersist() {
        createdAt = Instant.now();
    }

    public enum ResponseStatus {
        ACCEPTED,
        REJECTED
    }

    public Long getId() {
        return id;
    }

    public JobRequest getJob() {
        return job;
    }

    public void setJob(JobRequest job) {
        this.job = job;
    }

    public AppUser getAssistant() {
        return assistant;
    }

    public void setAssistant(AppUser assistant) {
        this.assistant = assistant;
    }

    public ResponseStatus getStatus() {
        return status;
    }

    public void setStatus(ResponseStatus status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}

