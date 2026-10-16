package com.manfriday.user;


import java.util.Set;

public record UserDto(
        Long id,
        String username,
        AppUser.Role role,
        Set<String> skills
) {
    public static UserDto from(AppUser u) {
        return new UserDto(u.getId(), u.getUsername(), u.getRole(), Set.copyOf(u.getSkills()));
    }
}
