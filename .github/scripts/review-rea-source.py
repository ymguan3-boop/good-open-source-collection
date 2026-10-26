#!/usr/bin/env python3
"""Static, non-executing source risk inventory for third-party REA snapshot.
Not a proof of absence of malware. NEVER execute upstream scripts in this review.
"""
import argparse
import collections
import json
import os
import pathlib
import re
from datetime import datetime, timezone

ap=argparse.ArgumentParser()
ap.add_argument("--source",required=True)
ap.add_argument("--report",required=True)
ap.add_argument("--npm-audit",required=True)
ap.add_argument("--commit",required=True)
args=ap.parse_args()
root=pathlib.Path(args.source).resolve()
patterns={
    "execution_shell":r"\b(?:execSync|spawnSync|execFile|child_process|subprocess\.run|os\.system|Runtime\.getRuntime)\b",
    "dynamic_code":r"\b(?:eval|new Function|Function)\s*\(",
    "network_io":r"\b(?:fetch|https?\.request|axios|urllib\.request|requests\.(?:get|post))\s*\(",
    "privilege_management":r"\b(?:sudo|pkexec|chmod\s+777|setuid|chown)\b",
    "download_pipe_shell":r"\b(?:curl|wget)\b[^\n]{0,200}\|\s*(?:sh|bash)\b",
    "filesystem_destructive":r"\brm\s+-[rfRF]{2,}\s+(?:/|~|\$HOME)\b",
    "credential_access":r"(?:\.aws/credentials|\.ssh/id_rsa|process\.env\.(?:GITHUB_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY))",
}
secret_patterns={
    "github_classic_pat":r"\bghp_[A-Za-z0-9]{36}\b",
    "github_fine_grained_pat":r"\bgithub_pat_[A-Za-z0-9_]{60,}\b",
    "aws_access_key":r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
    "private_key":r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
    "npm_token":r"\bnpm_[A-Za-z0-9]{36}\b",
}
compiled={k:re.compile(v,re.I) for k,v in patterns.items()}
secret_compiled={k:re.compile(v) for k,v in secret_patterns.items()}
stats=collections.Counter()
matches=collections.defaultdict(list)
secrets=[]
oversized=[]
escapes=[]
extensions=collections.Counter()
source_bytes=0
ignored=set([".git","node_modules",".next","dist","build","coverage"])
for base,dirs,files in os.walk(root,followlinks=False):
    dirs[:]=[d for d in dirs if d not in ignored]
    for f in files:
        p=pathlib.Path(base)/f
        rel=p.relative_to(root).as_posix()
        if p.is_symlink():
            stats["symlinks"]+=1
            resolved=p.resolve()
            if resolved!=root and root not in resolved.parents:
                escapes.append(rel)
            continue
        if not p.is_file():
            continue
        stats["all_files"]+=1
        n=p.stat().st_size
        source_bytes+=n
        extensions[p.suffix.lower()]+=1
        if n>95_000_000:
            oversized.append([rel,n])
        if n>5_000_000:
            stats["large_files_skipped_content"]+=1
            continue
        try:
            raw=p.read_bytes()
            if b"\x00" in raw[:4096]:
                stats["binary_files"]+=1
                continue
            s=raw.decode("utf-8")
        except (UnicodeDecodeError, OSError):
            stats["nontext_files"]+=1
            continue
        stats["text_files_scanned"]+=1
        # Captures sources, scripts, and docs; contextual review is still needed.
        for category,reg in compiled.items():
            hit=reg.search(s)
            if hit:
                stats[category]+=1
                if len(matches[category])<40:
                    matches[category].append(rel)
        for category,reg in secret_compiled.items():
            if reg.search(s):
                # Manually verified: Binwalk uses literal PEM header markers in a
                # Rust byte-string signature inventory, not actual private keys.
                if (category=="private_key" and rel=="third_party/binwalk/src/signatures/pem.rs"
                    and 'b"-----BEGIN PRIVATE KEY-----"' in s
                    and 'b"-----BEGIN OPENSSH PRIVATE KEY-----"' in s
                    and "-----END PRIVATE KEY-----" not in s):
                    stats["reviewed_pem_signature_false_positive"]+=1
                    continue
                secrets.append({"category":category,"file":rel})
try:
    lock=json.loads((root/"package-lock.json").read_text())
    packages=lock.get("packages",{})
    install_scripts=[{"name":k,"version":v.get("version")} for k,v in packages.items() if v.get("hasInstallScript")]
except Exception as e:
    packages={}
    install_scripts=[]
    stats["lock_parse_error"]+=1
try:
    audit=json.loads(pathlib.Path(args.npm_audit).read_text())
    vulns=audit.get("metadata",{}).get("vulnerabilities",{})
    audit_status={"vulnerabilities":vulns,"error":audit.get("error"),"affected_packages":list(audit.get("vulnerabilities",{}).keys())[:80]}
except Exception as e:
    audit_status={"error":str(e)}
submodules=["binwalk","ghidra-nativeaot","jadx-headless-mcp","unblob","wakaru"]
submod={}
for s in submodules:
    p=root/"third_party"/s
    present=p.is_dir() and any(p.iterdir())
    licenses=sorted([x.relative_to(p).as_posix() for x in p.iterdir() if x.is_file() and ("license" in x.name.lower() or "copying" in x.name.lower())]) if present else []
    submod[s]={"source_present":present,"root_license_files":licenses}
blockers=[]
if oversized:blockers.append("Some source file exceeds safe GitHub object threshold (95 MB).")
if escapes:blockers.append("Symlink escapes import directory.")
if secrets:blockers.append("Potential hard-coded secrets or private keys require manual validation.")
if not (root/"LICENSE").is_file():blockers.append("Missing upstream LICENSE.")
if not (root/"THIRD_PARTY_NOTICES.md").is_file():blockers.append("Missing upstream notices.")
if not all(x["source_present"] for x in submod.values()):blockers.append("At least one upstream submodule missing.")
if "error" in audit_status and audit_status["error"]:blockers.append("npm audit did not complete cleanly.")
if int(audit_status.get("vulnerabilities",{}).get("critical",0) or 0)>0:blockers.append("Critical production npm dependency advisory.")
if int(audit_status.get("vulnerabilities",{}).get("high",0) or 0)>0:blockers.append("High production npm dependency advisory.")
if stats.get("lock_parse_error"):blockers.append("package-lock.json invalid.")
if stats.get("download_pipe_shell",0)>0:stats["download_pipe_shell_requires_review"]=True
result={
    "timestamp_utc":datetime.now(timezone.utc).isoformat(),
    "source":"https://github.com/morluto/rea",
    "pinned_commit":args.commit,
    "method":"Entire source checkout with initialized pinned submodules; text static pattern scan, secret heuristic scan, symlink/large-file checks, npm production advisory check. No upstream code was executed.",
    "stats":dict(stats),
    "total_file_bytes":source_bytes,
    "file_extensions_top":extensions.most_common(30),
    "patterns_with_paths":dict(matches),
    "potential_secrets":secrets[:100],
    "oversized_files":oversized,
    "unsafe_symlinks":escapes,
    "submodules":submod,
    "lock_package_count":len(packages),
    "dependencies_declaring_install_scripts":install_scripts,
    "npm_audit":audit_status,
    "blocking_findings":blockers,
    "review_passed_automated_gates":not blockers,
    "limits":"Pattern checks produce false positives and miss obfuscated or runtime-only behavior. npm audit has partial ecosystem coverage. No independent sandbox execution, full line-by-line human code review, or proof of harmlessness.",
}
rp=pathlib.Path(args.report)
rp.parent.mkdir(parents=True,exist_ok=True)
rp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
print(json.dumps({k:result[k] for k in ["pinned_commit","stats","npm_audit","blocking_findings","review_passed_automated_gates"]},ensure_ascii=False,indent=2))
if blockers:
    raise SystemExit(2)
