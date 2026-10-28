#!/usr/bin/env python3
"""Non-executing whole-tree security inventory for Dean Lin's data-deidentification.
A static heuristic scan is NOT a malware-free guarantee. The source is never run.
"""
import argparse,collections,hashlib,json,os,pathlib,re
from datetime import datetime,timezone
p=argparse.ArgumentParser()
p.add_argument("--source",required=True)
p.add_argument("--dest",required=True)
p.add_argument("--commit",required=True)
p.add_argument("--npm-audit",required=True)
a=p.parse_args()
root=pathlib.Path(a.source).resolve(); out=pathlib.Path(a.dest);out.mkdir(parents=True,exist_ok=True)
patterns={
"network_api":r"\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|axios\.(?:post|get)|navigator\.sendBeacon)\s*\(",
"network_endpoint":r"https?://[A-Za-z0-9._-]+",
"shell_command":r"\b(?:execSync|spawnSync|execFileSync|child_process|os\.system|subprocess\.(?:run|Popen))\b",
"dynamic_code":r"\b(?:eval|new Function)\s*\(",
"browser_storage":r"\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b",
"file_handling":r"\b(?:FileReader|readAsArrayBuffer|readAsText|createObjectURL|FileSystemHandle|showOpenFilePicker)\b",
"remote_script":r"<script\b[^>]*\bsrc\s*=\s*['\"]https?://",
"download_pipe_shell":r"\b(?:curl|wget)\b[^\n]{0,200}\|\s*(?:sh|bash)\b",
"dangerous_delete":r"\b(?:rm\s+-rf\s+(?:/|~|\$HOME)|Remove-Item\s+-Recurse\s+-Force)\b",
"agent_instructions":r"\b(?:ignore (?:all )?(?:previous|prior) instructions|reveal .*?(?:secret|token)|disable .*?safety|execute_command:)\b"
}
secrets={
"github_pat":r"\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})\b",
"aws_key":r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
"private_key":r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
"npm_token":r"\bnpm_[A-Za-z0-9]{36}\b",
"anthropic_key":r"\bsk-ant-[A-Za-z0-9_-]{20,}",
"openai_key":r"\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}"
}
rules={k:re.compile(v,re.I) for k,v in patterns.items()}
srules={k:re.compile(v) for k,v in secrets.items()}
counts=collections.Counter(); hits=collections.defaultdict(list); flagged=[];links=[];large=[]; file_manifest=[]
for base,dirs,files in os.walk(root,followlinks=False):
  dirs[:]=[x for x in dirs if x!=".git"]
  for name in files:
    f=pathlib.Path(base)/name
    rel=f.relative_to(root).as_posix()
    if f.is_symlink():
      counts["symlinks"]+=1
      link=f.resolve()
      if link!=root and root not in link.parents:links.append(rel)
      continue
    if not f.is_file():continue
    n=f.stat().st_size
    counts["files"]+=1;counts["bytes"]+=n
    if n>=95000000:large.append([rel,n])
    if n>8000000:
      counts["oversize_skipped_text"]+=1
      file_manifest.append([rel,n,"content not scanned"])
      continue
    binary=False
    try:
      raw=f.read_bytes()
      if b"\x00" in raw[:4096]:binary=True
      if binary:counts["binary_files"]+=1;continue
      body=raw.decode("utf-8")
    except (OSError,UnicodeError):
      counts["non_utf8_files"]+=1;continue
    counts["text_files_scanned"]+=1
    lines=body.splitlines()
    for line_no,line in enumerate(lines,1):
      for label,rx in rules.items():
        if rx.search(line):
          counts[label+"_lines"]+=1
          if len(hits[label])<35:
            hits[label].append({"file":rel,"line":line_no,"preview":line[:180]})
      for label,rx in srules.items():
        if rx.search(line):
          flagged.append({"type":label,"file":rel,"line":line_no})
try:
  pkg=json.loads((root/"package.json").read_text())
  lock=json.loads((root/"package-lock.json").read_text())
  install_scripts=[{"package":k,"version":v.get("version")} for k,v in lock.get("packages",{}).items() if v.get("hasInstallScript")]
  counts["lockfile_packages"]=len(lock.get("packages",{}))
  for k in ("preinstall","install","postinstall","prepare","prepublishOnly"):
    if k in pkg.get("scripts",{}):
      flagged.append({"type":"root_lifecycle_script","name":k})
except Exception as e:flagged.append({"type":"package_parse_error","detail":str(e)});install_scripts=[]
try:
  audit=json.loads(pathlib.Path(a.npm_audit).read_text())
  vuln=audit.get("metadata",{}).get("vulnerabilities",{})
  reported=list(audit.get("vulnerabilities",{}).keys())
  aerror=audit.get("error")
except Exception as e:vuln={};reported=[];aerror=str(e)
checks={
"source_license":(root/"LICENSE").exists(),
"source_readme":(root/"README.md").exists(),
"lockfile":(root/"package-lock.json").exists(),
"source_src":(root/"src").is_dir(),
"source_tests":(root/"tests").is_dir(),
"source_scripts":(root/"scripts").is_dir(),
"source_agent_docs":(root/".claude").is_dir(),
}
blockers=[]
if links:blockers.append("Escaping symlinks")
if large:blockers.append("Git object above 95 MB")
if flagged:blockers.append("Sensitive hardcoded data or lifecycle hooks require review")
if not all(checks.values()):blockers.append("Expected upstream tree contents missing")
if aerror:blockers.append("npm audit unavailable or errored")
if int(vuln.get("high") or 0)>0 or int(vuln.get("critical") or 0)>0:blockers.append("High/critical npm production dependencies")
result={
"timestamp_utc":datetime.now(timezone.utc).isoformat(),
"upstream_url":"https://github.com/dean9703111/data-deidentification",
"pinned_commit":a.commit,
"method":"Pinned complete upstream checkout. All files enumerated; text contents scanned for network, executable, dynamic code, browser storage, hardcoded credential and suspicious instruction patterns. npm production advisory check without running upstream code.",
"counts":dict(counts),"patterns":dict(hits),"credential_flags":flagged,
"escaping_symlinks":links,"too_large_for_git":large,
"checks":checks,"install_script_dependencies":install_scripts,
"npm_production":{"advisory_counts":vuln,"affected_packages":reported,"error":aerror},
"blockers":blockers,"automated_gates_passed":not blockers,
"limitations":["Heuristic static scanning cannot prove absence of malware, exfiltration, or zero-day vulnerabilities.","HTML/JS embedded in binary files and minified dependencies outside Git were not comprehensively reversed.","No upstream scripts, installs, tests, or web app were executed. Browser network observation and penetration tests were not performed.","Potential test fixture and documentation privacy may require contextual review."],
}
(out/"static-security.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
print(json.dumps({k:result[k] for k in ["pinned_commit","counts","credential_flags","npm_production","blockers","automated_gates_passed"]},ensure_ascii=False,indent=2))
raise SystemExit(2 if blockers else 0)
