import { describe, it, expect } from "bun:test";
import {
  generateGitRepoUserData,
  generateGitRepoRedeployCommands,
  generateContainerImageUserData,
  generateContainerImageRedeployCommands,
} from "./ec2_deploy_templates.js";

describe("ec2_deploy_templates (git repo mode)", () => {
  it("test_generate_git_repo_user_data_clones_the_given_branch_into_the_fixed_workdir_and_runs_the_start_command", () => {
    const script = generateGitRepoUserData({
      repoUrl: "https://github.com/example/app.git",
      branch: "main",
      startCommand: "npm start",
    });

    expect(script).toContain("#!/bin/sh");
    expect(script).toContain("git clone --branch main --depth 1 https://github.com/example/app.git /opt/app");
    expect(script).toContain("cd /opt/app");
    expect(script).toContain("npm start");
    // Real order matters - starting the app before the clone completes would fail.
    expect(script.indexOf("git clone")).toBeLessThan(script.indexOf("npm start"));
  });

  it("test_generate_git_repo_user_data_honors_a_non_default_branch", () => {
    const script = generateGitRepoUserData({ repoUrl: "https://github.com/example/app.git", branch: "release", startCommand: "npm start" });
    expect(script).toContain("--branch release");
  });

  it("test_generate_git_repo_redeploy_commands_pulls_from_the_same_fixed_workdir_and_reruns_the_start_command", () => {
    const commands = generateGitRepoRedeployCommands({
      repoUrl: "https://github.com/example/app.git",
      branch: "main",
      startCommand: "systemctl restart myapp",
    });

    expect(commands).toEqual(["cd /opt/app", "git pull", "systemctl restart myapp"]);
  });
});

describe("ec2_deploy_templates (container image mode)", () => {
  it("test_generate_container_image_user_data_installs_docker_and_runs_the_image_on_the_given_port", () => {
    const script = generateContainerImageUserData({ image: "nginx:latest", port: 8080 });

    expect(script).toContain("#!/bin/sh");
    expect(script).toContain("dnf install -y docker");
    expect(script).toContain("systemctl enable --now docker");
    expect(script).toContain("docker run -d --name app -p 8080:8080 nginx:latest");
    // Real order matters - running before docker is installed/started would fail.
    expect(script.indexOf("dnf install")).toBeLessThan(script.indexOf("docker run"));
    expect(script.indexOf("systemctl enable")).toBeLessThan(script.indexOf("docker run"));
  });

  it("test_generate_container_image_redeploy_commands_pulls_stops_removes_then_reruns_in_that_order", () => {
    const commands = generateContainerImageRedeployCommands({ image: "nginx:latest", port: 8080 });

    expect(commands).toEqual([
      "docker pull nginx:latest",
      "docker stop app || true",
      "docker rm app || true",
      "docker run -d --name app -p 8080:8080 nginx:latest",
    ]);
  });

  it("test_generate_container_image_redeploy_commands_uses_the_real_stop_and_remove_before_rerunning_so_the_port_binding_is_free", () => {
    const commands = generateContainerImageRedeployCommands({ image: "myapp:v2", port: 3000 });
    const stopIndex = commands.indexOf("docker stop app || true");
    const runIndex = commands.findIndex((c) => c.startsWith("docker run"));
    expect(stopIndex).toBeGreaterThanOrEqual(0);
    expect(stopIndex).toBeLessThan(runIndex);
  });
});
