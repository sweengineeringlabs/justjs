// Real script/command generators for EC2's two guided deploy modes
// (ADR-0020/justjs#149) - "Git repo" and "Container image", alongside
// the existing free-text "Raw script" mode. Purely client-side
// templating: the generated strings feed straight into
// Ec2InstanceConfig.userData (launch) or runCommandOnEc2Instance's
// commands array (redeploy) exactly as a hand-typed script/command list
// already did - @justjs/cloud-connect's contract is untouched by this
// file entirely.
//
// No shell-escaping of the structured field values - matches this app's
// own existing Redeploy textarea, which already passes hand-typed
// commands straight through with zero escaping. This is a tool the user
// directly controls their own input into, not a boundary handling
// untrusted third-party data.

export interface GitRepoDeployConfig {
  readonly repoUrl: string;
  readonly branch: string;
  readonly startCommand: string;
}

export interface ContainerImageDeployConfig {
  readonly image: string;
  readonly port: number;
}

// Real, disclosed assumption (ADR-0020): every launch this app performs
// lands the checkout at this fixed path - redeploy's own `git pull`
// only makes sense if it's looking in the same place launch cloned
// into. Not configurable - a fixed convention, not a guess made fresh
// each time.
const GIT_REPO_WORKDIR = "/opt/app";
const CONTAINER_NAME = "app";

export function generateGitRepoUserData(config: GitRepoDeployConfig): string {
  return [
    "#!/bin/sh",
    `git clone --branch ${config.branch} --depth 1 ${config.repoUrl} ${GIT_REPO_WORKDIR}`,
    `cd ${GIT_REPO_WORKDIR}`,
    config.startCommand,
  ].join("\n");
}

export function generateGitRepoRedeployCommands(config: GitRepoDeployConfig): readonly string[] {
  return [`cd ${GIT_REPO_WORKDIR}`, "git pull", config.startCommand];
}

// Assumes Amazon Linux 2023 (dnf) - AWS's own EC2 console quick-launch
// default AMI family, disclosed directly in the UI, not silently
// guessed. A different base OS needs "Raw script" mode instead.
export function generateContainerImageUserData(config: ContainerImageDeployConfig): string {
  return [
    "#!/bin/sh",
    "dnf install -y docker",
    "systemctl enable --now docker",
    `docker run -d --name ${CONTAINER_NAME} -p ${config.port}:${config.port} ${config.image}`,
  ].join("\n");
}

export function generateContainerImageRedeployCommands(config: ContainerImageDeployConfig): readonly string[] {
  return [
    `docker pull ${config.image}`,
    `docker stop ${CONTAINER_NAME} || true`,
    `docker rm ${CONTAINER_NAME} || true`,
    `docker run -d --name ${CONTAINER_NAME} -p ${config.port}:${config.port} ${config.image}`,
  ];
}
