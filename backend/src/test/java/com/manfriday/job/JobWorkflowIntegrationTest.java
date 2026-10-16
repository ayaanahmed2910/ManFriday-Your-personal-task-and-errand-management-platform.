package com.manfriday.job;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class JobWorkflowIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    private static final RequestPostProcessor CLIENT = httpBasic("alice", "secret1");
    private static final RequestPostProcessor ASSISTANT = httpBasic("bob", "secret2");
    private static final RequestPostProcessor ASSISTANT2 = httpBasic("carol", "secret3");
    private static final RequestPostProcessor ADMIN = httpBasic("admin", "admin123");

    private void register(String username, String password, String role) throws Exception {
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","password":"%s","role":"%s","skills":["errands"]}
                                """.formatted(username, password, role)))
                .andExpect(status().isCreated());
    }

    private long createJob() throws Exception {
        String body = mvc.perform(post("/api/jobs").with(CLIENT).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"category\":\"TV_REPAIR\",\"instructions\":\"Fix the living room TV\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andReturn().getResponse().getContentAsString();
        JsonNode node = json.readTree(body);
        return node.get("id").asLong();
    }

    private void setUpUsers() throws Exception {
        register("alice", "secret1", "CLIENT");
        register("bob", "secret2", "ASSISTANT");
        register("carol", "secret3", "ASSISTANT");
    }

    @Test
    void fullHappyPath() throws Exception {
        setUpUsers();
        long id = createJob();

        mvc.perform(get("/api/jobs/available").with(ASSISTANT))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id));

        mvc.perform(post("/api/jobs/{id}/response", id).param("accept", "true").with(ASSISTANT))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ASSISTANT_ACCEPTED"))
                .andExpect(jsonPath("$.assistantUsername").value("bob"));

        // Accepted jobs disappear from other assistants' lists, and they cannot grab it
        mvc.perform(get("/api/jobs/available").with(ASSISTANT2))
                .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(post("/api/jobs/{id}/response", id).param("accept", "true").with(ASSISTANT2))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/jobs/{id}/start", id).with(ASSISTANT2))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/jobs/{id}/complete", id).with(ASSISTANT))
                .andExpect(status().isConflict()); // must start first
        mvc.perform(post("/api/jobs/{id}/start", id).with(ASSISTANT))
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"));

        // Client can't cancel once work started
        mvc.perform(post("/api/jobs/{id}/cancel", id).with(CLIENT))
                .andExpect(status().isConflict());

        mvc.perform(post("/api/jobs/{id}/complete", id).with(ASSISTANT))
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        mvc.perform(get("/api/jobs/mine").with(CLIENT))
                .andExpect(jsonPath("$[0].status").value("COMPLETED"))
                .andExpect(jsonPath("$[0].assistantUsername").value("bob"));
        mvc.perform(get("/api/jobs/assigned").with(ASSISTANT))
                .andExpect(jsonPath("$[0].id").value(id));
    }

    @Test
    void rejectionOnlyHidesJobFromThatAssistant() throws Exception {
        setUpUsers();
        long id = createJob();

        mvc.perform(post("/api/jobs/{id}/response", id).param("accept", "false").with(ASSISTANT))
                .andExpect(jsonPath("$.status").value("PUBLISHED"));
        mvc.perform(get("/api/jobs/available").with(ASSISTANT))
                .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/jobs/available").with(ASSISTANT2))
                .andExpect(jsonPath("$[0].id").value(id));
        mvc.perform(post("/api/jobs/{id}/response", id).param("accept", "true").with(ASSISTANT))
                .andExpect(status().isConflict());
    }

    @Test
    void clientCancelAndAdminControls() throws Exception {
        setUpUsers();
        long id = createJob();

        mvc.perform(post("/api/jobs/{id}/cancel", id).with(CLIENT))
                .andExpect(jsonPath("$.status").value("CANCELLED"));

        mvc.perform(get("/api/jobs/admin/all").with(ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("CANCELLED"));
        mvc.perform(put("/api/jobs/admin/{id}/status", id).param("status", "PUBLISHED").with(ADMIN))
                .andExpect(jsonPath("$.status").value("PUBLISHED"));
        mvc.perform(get("/api/admin/users").with(ADMIN))
                .andExpect(jsonPath("$.length()").value(4));
    }

    @Test
    void securityRules() throws Exception {
        setUpUsers();

        mvc.perform(get("/api/jobs/mine")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").with(httpBasic("alice", "wrong"))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").with(CLIENT))
                .andExpect(jsonPath("$.role").value("CLIENT"));

        // wrong roles
        mvc.perform(post("/api/jobs").with(ASSISTANT).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"category\":\"OTHER\",\"instructions\":\"x\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/jobs/available").with(CLIENT)).andExpect(status().isForbidden());
        mvc.perform(get("/api/jobs/admin/all").with(CLIENT)).andExpect(status().isForbidden());

        // registration rules
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"evil\",\"password\":\"secret1\",\"role\":\"ADMIN\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"alice\",\"password\":\"secret1\",\"role\":\"CLIENT\"}"))
                .andExpect(status().isConflict());

        // validation
        mvc.perform(post("/api/jobs").with(CLIENT).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"category\":\"OTHER\",\"instructions\":\"  \"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/jobs/999/cancel").with(CLIENT)).andExpect(status().isNotFound());
    }
}
