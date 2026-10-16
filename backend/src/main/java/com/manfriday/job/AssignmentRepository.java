package com.manfriday.job;

import com.manfriday.user.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AssignmentRepository extends JpaRepository<Assignment, Long> {
    boolean existsByJobAndAssistant(JobRequest job, AppUser assistant);
}
