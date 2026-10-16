package com.manfriday.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public record RegisterRequest(
        @NotBlank @Size(min = 3, max = 80)
        @Pattern(regexp = "[A-Za-z0-9._-]+", message = "may only contain letters, digits, dot, underscore, dash")
        String username,
        @NotBlank @Size(min = 6, max = 72) String password,
        @NotNull AppUser.Role role,
        List<@Size(max = 60) String> skills
) {}
