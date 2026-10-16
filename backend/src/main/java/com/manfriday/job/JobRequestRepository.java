package com.manfriday.job;

import com.manfriday.job.JobRequest.JobStatus;
import com.manfriday.user.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface JobRequestRepository extends JpaRepository<JobRequest, Long> {
    List<JobRequest> findByClientOrderByCreatedAtDesc(AppUser client);

    List<JobRequest> findByAssistantOrderByUpdatedAtDesc(AppUser assistant);

    List<JobRequest> findAllByOrderByCreatedAtDesc();

    // Open jobs this assistant has not already responded to
    @Query("""
            select j from JobRequest j
            where j.status = :status
              and not exists (select a from Assignment a where a.job = j and a.assistant = :assistant)
            order by j.createdAt desc
            """)
    List<JobRequest> findOpenFor(JobStatus status, AppUser assistant);
}
