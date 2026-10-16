package com.manfriday.user;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;

    public AuthController(AppUserRepository appUserRepository, PasswordEncoder passwordEncoder) {
        this.appUserRepository = appUserRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserDto register(@Valid @RequestBody RegisterRequest req) {
        // Admins are seeded via configuration, never self-registered
        if (req.role() == AppUser.Role.ADMIN) {
            throw new IllegalArgumentException("Cannot self-register as ADMIN");
        }
        if (appUserRepository.existsByUsername(req.username())) {
            throw new IllegalStateException("Username already exists");
        }

        AppUser u = new AppUser();
        u.setUsername(req.username());
        u.setPassword(passwordEncoder.encode(req.password()));
        u.setRole(req.role());
        if (req.skills() != null) {
            req.skills().stream().map(String::trim).filter(s -> !s.isEmpty()).forEach(u.getSkills()::add);
        }

        return UserDto.from(appUserRepository.save(u));
    }

    // Used by the frontend to validate credentials and learn the user's role
    @GetMapping("/me")
    @Transactional(readOnly = true)
    public UserDto me(Authentication auth) {
        return appUserRepository.findByUsername(auth.getName())
                .map(UserDto::from)
                .orElseThrow(() -> new IllegalStateException("Authenticated user not found in DB"));
    }
}
