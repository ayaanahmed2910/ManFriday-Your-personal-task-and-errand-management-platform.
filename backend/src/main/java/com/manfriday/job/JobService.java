package com.manfriday.job;

import com.manfriday.common.NotFoundException;
import com.manfriday.job.JobRequest.JobStatus;
import com.manfriday.user.AppUser;
import com.manfriday.user.AppUserRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Job workflow. Role checks live in SecurityConfig (URL rules);
 * this class enforces ownership and valid status transitions.
 */
@Service
public class JobService {

    private final JobRequestRepository jobRequestRepository;
    private final AssignmentRepository assignmentRepository;
    private final AppUserRepository appUserRepository;

    public JobService(JobRequestRepository jobRequestRepository,
                      AssignmentRepository assignmentRepository,
                      AppUserRepository appUserRepository) {
        this.jobRequestRepository = jobRequestRepository;
        this.assignmentRepository = assignmentRepository;
        this.appUserRepository = appUserRepository;
    }

    private AppUser currentUser() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        String username = a.getName();
        return appUserRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalStateException("Authenticated user not found in DB"));
    }

    private JobRequest findJob(Long jobId) {
        return jobRequestRepository.findById(jobId)
                .orElseThrow(() -> new NotFoundException("Job not found"));
    }

    // ---- CLIENT ----

    @Transactional
    public JobDto createJob(CreateJobRequestDto dto) {
        JobRequest j = new JobRequest();
        j.setClient(currentUser());
        j.setCategory(dto.category());
        j.setInstructions(dto.instructions().trim());
        j.setStatus(JobStatus.PUBLISHED);
        return toDto(jobRequestRepository.save(j));
    }

    @Transactional(readOnly = true)
    public List<JobDto> listMyJobsAsClient() {
        return jobRequestRepository.findByClientOrderByCreatedAtDesc(currentUser())
                .stream().map(this::toDto).toList();
    }

    @Transactional
    public JobDto clientCancel(Long jobId) {
        AppUser client = currentUser();
        JobRequest job = findJob(jobId);
        if (!job.getClient().getId().equals(client.getId())) {
            throw new AccessDeniedException("Not your job");
        }
        if (job.getStatus() != JobStatus.PUBLISHED && job.getStatus() != JobStatus.ASSISTANT_ACCEPTED) {
            throw new IllegalStateException("Job can no longer be cancelled (status " + job.getStatus() + ")");
        }
        job.setStatus(JobStatus.CANCELLED);
        return toDto(jobRequestRepository.saveAndFlush(job));
    }

    // ---- ASSISTANT ----

    @Transactional(readOnly = true)
    public List<JobDto> listAvailable() {
        return jobRequestRepository.findOpenFor(JobStatus.PUBLISHED, currentUser())
                .stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<JobDto> listAssignedToMe() {
        return jobRequestRepository.findByAssistantOrderByUpdatedAtDesc(currentUser())
                .stream().map(this::toDto).toList();
    }

    @Transactional
    public JobDto assistantRespond(Long jobId, boolean accept) {
        AppUser assistant = currentUser();
        JobRequest job = findJob(jobId);

        if (job.getStatus() != JobStatus.PUBLISHED) {
            throw new IllegalStateException("Job is not available");
        }
        if (assignmentRepository.existsByJobAndAssistant(job, assistant)) {
            throw new IllegalStateException("You already responded to this job");
        }

        Assignment response = new Assignment();
        response.setJob(job);
        response.setAssistant(assistant);
        response.setStatus(accept ? Assignment.ResponseStatus.ACCEPTED : Assignment.ResponseStatus.REJECTED);
        assignmentRepository.save(response);

        // A rejection only hides the job from this assistant; it stays open for others.
        // Concurrent accepts are guarded by JobRequest's @Version (optimistic lock).
        if (accept) {
            job.setAssistant(assistant);
            job.setStatus(JobStatus.ASSISTANT_ACCEPTED);
        }
        return toDto(jobRequestRepository.saveAndFlush(job));
    }

    @Transactional
    public JobDto assistantAdvance(Long jobId, JobStatus target) {
        AppUser assistant = currentUser();
        JobRequest job = findJob(jobId);
        if (job.getAssistant() == null || !job.getAssistant().getId().equals(assistant.getId())) {
            throw new AccessDeniedException("Job is not assigned to you");
        }

        JobStatus required = switch (target) {
            case IN_PROGRESS -> JobStatus.ASSISTANT_ACCEPTED;
            case COMPLETED -> JobStatus.IN_PROGRESS;
            default -> throw new IllegalArgumentException("Assistants can only start or complete jobs");
        };
        if (job.getStatus() != required) {
            throw new IllegalStateException("Cannot move job from " + job.getStatus() + " to " + target);
        }
        job.setStatus(target);
        return toDto(jobRequestRepository.saveAndFlush(job));
    }

    // ---- ADMIN ----

    @Transactional(readOnly = true)
    public List<JobDto> listAllForAdmin() {
        return jobRequestRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toDto).toList();
    }

    @Transactional
    public JobDto adminSetStatus(Long jobId, JobStatus newStatus) {
        JobRequest job = findJob(jobId);
        job.setStatus(newStatus);
        // Re-opening a job releases the previous assistant
        if (newStatus == JobStatus.PUBLISHED) {
            job.setAssistant(null);
        }
        return toDto(jobRequestRepository.saveAndFlush(job));
    }

    private JobDto toDto(JobRequest j) {
        return new JobDto(
                j.getId(),
                j.getCategory(),
                j.getInstructions(),
                j.getStatus(),
                j.getCreatedAt(),
                j.getUpdatedAt(),
                j.getClient() == null ? null : j.getClient().getUsername(),
                j.getAssistant() == null ? null : j.getAssistant().getUsername()
        );
    }
}
