package com.manfriday.job;

import com.manfriday.user.AppUser;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "job_request")
public class JobRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "client_user_id", nullable = false)
    private AppUser client;

    // Assistant who accepted the job; null while the job is still open
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assistant_user_id")
    private AppUser assistant;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Category category;

    @Column(nullable = false, length = 2000)
    private String instructions;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private JobStatus status;

    private Instant createdAt;

    private Instant updatedAt;

    @Version
    private Long version;

    public enum Category {
        TV_REPAIR,
        DOCUMENT_SUBMISSION,
        GROCERY_SHOPPING,
        BILL_PAYMENT,
        PARCEL_PICKUP,
        OTHER
    }

    /**
     * Lifecycle: PUBLISHED -> ASSISTANT_ACCEPTED -> IN_PROGRESS -> COMPLETED.
     * A client may CANCEL before work starts; an admin may set any status (e.g. REJECTED).
     */
    public enum JobStatus {
        PUBLISHED,
        ASSISTANT_ACCEPTED,
        IN_PROGRESS,
        COMPLETED,
        REJECTED,
        CANCELLED
    }

    @PrePersist
    public void prePersist() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public AppUser getClient() {
        return client;
    }

    public void setClient(AppUser client) {
        this.client = client;
    }

    public AppUser getAssistant() {
        return assistant;
    }

    public void setAssistant(AppUser assistant) {
        this.assistant = assistant;
    }

    public Category getCategory() {
        return category;
    }

    public void setCategory(Category category) {
        this.category = category;
    }

    public String getInstructions() {
        return instructions;
    }

    public void setInstructions(String instructions) {
        this.instructions = instructions;
    }

    public JobStatus getStatus() {
        return status;
    }

    public void setStatus(JobStatus status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Long getVersion() {
        return version;
    }
}

