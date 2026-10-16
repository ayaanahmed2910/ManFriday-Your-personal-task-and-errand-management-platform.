package com.manfriday.user;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Creates the initial ADMIN account on startup if it does not exist yet.
 * Credentials come from the manfriday.admin.* properties.
 */
@Component
public class AdminSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminSeeder.class);

    private final AppUserRepository repo;
    private final PasswordEncoder encoder;
    private final String username;
    private final String password;

    public AdminSeeder(AppUserRepository repo, PasswordEncoder encoder,
                       @Value("${manfriday.admin.username}") String username,
                       @Value("${manfriday.admin.password}") String password) {
        this.repo = repo;
        this.encoder = encoder;
        this.username = username;
        this.password = password;
    }

    @Override
    public void run(String... args) {
        if (repo.existsByUsername(username)) {
            return;
        }
        AppUser admin = new AppUser();
        admin.setUsername(username);
        admin.setPassword(encoder.encode(password));
        admin.setRole(AppUser.Role.ADMIN);
        repo.save(admin);
        log.info("Seeded admin user '{}'", username);
    }
}
