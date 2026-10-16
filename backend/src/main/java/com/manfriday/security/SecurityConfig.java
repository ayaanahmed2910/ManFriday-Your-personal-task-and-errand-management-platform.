package com.manfriday.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Stateless HTTP Basic auth against DB users (CustomUserDetailsService),
 * with role-based rules per endpoint.
 */
@Configuration
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // static frontend + public endpoints
                        .requestMatchers(HttpMethod.GET, "/", "/*.html", "/css/**", "/js/**", "/favicon.ico", "/health").permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register").permitAll()

                        // client
                        .requestMatchers(HttpMethod.POST, "/api/jobs").hasRole("CLIENT")
                        .requestMatchers(HttpMethod.GET, "/api/jobs/mine").hasRole("CLIENT")
                        .requestMatchers(HttpMethod.POST, "/api/jobs/*/cancel").hasRole("CLIENT")

                        // assistant
                        .requestMatchers(HttpMethod.GET, "/api/jobs/available", "/api/jobs/assigned").hasRole("ASSISTANT")
                        .requestMatchers(HttpMethod.POST, "/api/jobs/*/response", "/api/jobs/*/start", "/api/jobs/*/complete").hasRole("ASSISTANT")

                        // admin
                        .requestMatchers("/api/jobs/admin/**", "/api/admin/**").hasRole("ADMIN")

                        .anyRequest().authenticated()
                )
                // Plain 401 without a WWW-Authenticate challenge, so browsers skip their native login popup
                .httpBasic(basic -> basic.authenticationEntryPoint(jsonUnauthorized()))
                .exceptionHandling(ex -> ex.authenticationEntryPoint(jsonUnauthorized()));

        return http.build();
    }

    private AuthenticationEntryPoint jsonUnauthorized() {
        return (request, response, e) -> {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"status\":401,\"error\":\"Invalid or missing credentials\"}");
        };
    }
}
