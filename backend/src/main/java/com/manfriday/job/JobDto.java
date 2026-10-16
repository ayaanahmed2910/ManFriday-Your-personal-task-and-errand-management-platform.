package com.manfriday.job;


import java.time.Instant;

public record JobDto(
        Long id,
        JobRequest.Category category,
        String instructions,
        JobRequest.JobStatus status,
        Instant createdAt,
        Instant updatedAt,
        String clientUsername,
        String assistantUsername
) {}
