package com.manfriday.job;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateJobRequestDto(
        @NotNull JobRequest.Category category,
        @NotBlank @Size(max = 2000) String instructions
) {}
