package com.manfriday.job;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Role restrictions for these endpoints are declared in SecurityConfig
@RestController
@RequestMapping("/api/jobs")
public class JobController {

    private final JobService jobService;

    public JobController(JobService jobService) {
        this.jobService = jobService;
    }

    // CLIENT: create request
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public JobDto create(@Valid @RequestBody CreateJobRequestDto dto) {
        return jobService.createJob(dto);
    }

    // CLIENT: list my jobs
    @GetMapping("/mine")
    public List<JobDto> listMineAsClient() {
        return jobService.listMyJobsAsClient();
    }

    // CLIENT: cancel a job that hasn't started yet
    @PostMapping("/{jobId}/cancel")
    public JobDto cancel(@PathVariable Long jobId) {
        return jobService.clientCancel(jobId);
    }

    // ASSISTANT: list jobs available to me
    @GetMapping("/available")
    public List<JobDto> listAvailable() {
        return jobService.listAvailable();
    }

    // ASSISTANT: jobs I accepted
    @GetMapping("/assigned")
    public List<JobDto> listAssigned() {
        return jobService.listAssignedToMe();
    }

    // ASSISTANT: accept/reject a job
    @PostMapping("/{jobId}/response")
    public JobDto respond(@PathVariable Long jobId, @RequestParam boolean accept) {
        return jobService.assistantRespond(jobId, accept);
    }

    // ASSISTANT: start work on an accepted job
    @PostMapping("/{jobId}/start")
    public JobDto start(@PathVariable Long jobId) {
        return jobService.assistantAdvance(jobId, JobRequest.JobStatus.IN_PROGRESS);
    }

    // ASSISTANT: mark job done
    @PostMapping("/{jobId}/complete")
    public JobDto complete(@PathVariable Long jobId) {
        return jobService.assistantAdvance(jobId, JobRequest.JobStatus.COMPLETED);
    }

    // ADMIN: list all jobs
    @GetMapping("/admin/all")
    public List<JobDto> listAllForAdmin() {
        return jobService.listAllForAdmin();
    }

    // ADMIN: update status
    @PutMapping("/admin/{jobId}/status")
    public JobDto adminSetStatus(@PathVariable Long jobId, @RequestParam JobRequest.JobStatus status) {
        return jobService.adminSetStatus(jobId, status);
    }
}
