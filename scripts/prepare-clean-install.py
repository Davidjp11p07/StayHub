"""Prepare a clean-install acceptance run from a git archive (Windows host)."""
import argparse
import io
import ipaddress
import json
from pathlib import Path
import re
import socket
import subprocess
import zipfile


def output(*command, cwd=None):
    return subprocess.check_output(command, cwd=cwd)


def configure(target, project):
    source = target / "src-clean"
    infra = target / ".artifacts"
    compose = ["docker", "compose", "-p", project, "-f", "docker-compose.yml",
               "-f", "docker-compose.local.yml", "-f", "docker-compose.clean-test.yml"]
    model = json.loads(output(*compose, "config", "--format", "json", cwd=target))
    configs = {label: config["build"] for label, config in model["services"].items() if "build" in config}
    bake = {}
    groups = {}
    for label, config in configs.items():
        filename = config["dockerfile"]
        entry = {"context": ".", "dockerfile": filename, "tags": [project + "-" + label + ":latest"]}
        if "target" in config:
            entry["target"] = config["target"]
        bake[label] = entry
        groups.setdefault(filename, []).append(label)
    pool = ipaddress.ip_network((infra / "clean-subnet.txt").read_text())
    subnets = list(pool.subnets(new_prefix=24))
    if len(model["networks"]) > len(subnets):
        raise ValueError("Insufficient isolated subnets")
    networks = {k: {"ipam": {"config": [{"subnet": str(n)}]}}
                for k, n in zip(model["networks"], subnets)}
    (infra / "clean-networks.json").write_text(json.dumps({"networks": networks}, indent=2))
    (source / "fresh-bake.json").write_text(json.dumps({"target": bake}, indent=2))
    (infra / "build-groups.json").write_text(json.dumps(list(groups.values()), indent=2))
    print(f"{len(bake)} build targets, {len(networks)} project networks")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project")
    parser.add_argument("commit")
    parser.add_argument("--configure", action="store_true", help="Generate the models after env initialization")
    args = parser.parse_args()
    if not re.fullmatch(r"stayhub-clean-[a-z0-9-]+", args.project):
        parser.error("Use a fresh stayhub-clean- project name")
    root = Path(output("git", "rev-parse", "--show-toplevel").decode().strip())
    commit = output("git", "rev-parse", "--verify", args.commit + "^{commit}").decode().strip()
    target = root / ".artifacts" / args.project
    if args.configure:
        if (target / ".artifacts" / "clean-commit.txt").read_text().strip() != commit:
            raise ValueError("Unexpected commit in prepared copy")
        configure(target, args.project)
        return
    target.mkdir(parents=True, exist_ok=False)
    source = target / "src-clean"
    archive = output("git", "archive", "--format=zip", commit, cwd=root)
    with zipfile.ZipFile(io.BytesIO(archive)) as files:
        files.extractall(target)
        files.extractall(source)

    # Build contexts contain only the committed tree. Host tools and generated
    # credentials subsequently live in the outer copy.
    for kind in ["network", "volume"]:
        if output("docker", kind, "ls", "-q", "--filter", "label=com.docker.compose.project=" + args.project).strip():
            raise RuntimeError("Existing Docker resources for " + args.project)
    ids = output("docker", "network", "ls", "-q").decode().split()
    networks = json.loads(output("docker", "network", "inspect", *ids))
    used = [ipaddress.ip_network(item["Subnet"]) for network in networks
            for item in network["IPAM"]["Config"] or [] if "Subnet" in item]
    routes = json.loads(output("powershell", "-NoProfile", "-Command",
                               "ConvertTo-Json -InputObject @(Get-NetRoute -AddressFamily IPv4 | Select-Object -ExpandProperty DestinationPrefix)"))
    used.extend(ipaddress.ip_network(route, strict=False) for route in routes if route != "0.0.0.0/0")
    for port in [38080, 38443]:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", port))

    infra = target / ".artifacts"
    infra.mkdir(exist_ok=True)
    (infra / "clean-commit.txt").write_text(commit, encoding="ascii")
    # Compose expands the canonical service/network names after env generation.
    pool = next(block for block in ipaddress.ip_network("10.0.0.0/8").subnets(new_prefix=20)
                if all(net.version != 4 or not block.overlaps(net) for net in used))
    (infra / "clean-subnet.txt").write_text(str(pool), encoding="ascii")
    print(f"Exported {commit} to {target}; free subnet at preparation time: {pool}")


if __name__ == "__main__":
    main()
